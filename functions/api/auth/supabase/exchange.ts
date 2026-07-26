import { cookie, createSession, randomToken, slug } from "../../auth";
import {
  accountDisplayName, createIdentitySession, identityCookie, providerIdentity,
  recordAuthEvent, supabaseUser
} from "../../auth-provider";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const body = await parseJsonBody(request);
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    if (accessToken.length < 20 || accessToken.length > 4096) throw validationError("Please try signing in again.");
    const user = await supabaseUser(accessToken, env); const external = providerIdentity(user); const db = requireD1(env);
    const now = new Date().toISOString();
    let account = await db.prepare(`SELECT a.id, s.account_status AS status FROM auth_identities i
      JOIN user_accounts a ON a.id = i.account_id JOIN account_security s ON s.account_id = a.id
      WHERE i.provider = ? AND i.provider_subject = ? LIMIT 1`)
      .bind(external.provider, external.subject).first<{ id: string; status: string }>();
    let profileCreated = false;
    if (account && account.status !== "active") {
      await recordAuthEvent(db, { accountId: account?.id, eventName: "login_failure", provider: external.provider, result: "failure", safeCode: "ACCOUNT_UNAVAILABLE", requestId });
      throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "This Cradle account is not available right now.");
    }
    if (!account) {
      const accountId = crypto.randomUUID();
      const accountReference = `${slug(external.email?.split("@")[0] || "profile") || "profile"}-${crypto.randomUUID().slice(0, 8)}`;
      const profileName = accountDisplayName(user); const pinHash = randomToken(); const pinSalt = randomToken(16);
      await db.batch([
        db.prepare(`INSERT INTO user_accounts
          (id, account_reference, display_name, pin_hash, pin_salt, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).bind(accountId, accountReference, profileName, pinHash, pinSalt, now, now),
        db.prepare("INSERT INTO account_security (account_id, account_status, created_at, updated_at) VALUES (?, 'active', ?, ?)").bind(accountId, now, now),
        db.prepare("INSERT INTO profiles (account_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(accountId, profileName, now, now),
        db.prepare("INSERT INTO profile_preferences (account_id, preferences_json, created_at, updated_at) VALUES (?, '{}', ?, ?)").bind(accountId, now, now),
        db.prepare(`INSERT INTO auth_identities
          (id, account_id, provider, provider_subject, email, created_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), accountId, external.provider, external.subject, external.email, now, now)
      ]);
      account = { id: accountId, status: "active" };
      profileCreated = true;
    } else {
      await db.prepare("UPDATE auth_identities SET email = ?, last_seen_at = ? WHERE account_id = ? AND provider = ?")
        .bind(external.email, now, account.id, external.provider).run();
    }
    const identitySession = await createIdentitySession(db, account.id);
    const members = await db.prepare(`SELECT m.household_id AS householdId, m.id AS memberId
      FROM members m WHERE m.account_id = ? AND m.is_active = 1 AND m.lifecycle_state NOT IN ('suspended', 'left')
      ORDER BY m.created_at`).bind(account.id).all<{ householdId: string; memberId: string }>();
    const headers = new Headers({ "Set-Cookie": identityCookie(identitySession.token, env) });
    if (members.results.length === 1) {
      const householdSession = await createSession(db, members.results[0].householdId, members.results[0].memberId, account.id,
        external.provider === "email" ? "email_otp" : external.provider);
      headers.append("Set-Cookie", cookie(householdSession.token, env));
    }
    await recordAuthEvent(db, { accountId: account.id, eventName: "provider_login", provider: external.provider, result: "success", requestId });
    return success({ profileCreated, accountId: account.id, householdCount: members.results.length }, requestId, { headers });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
