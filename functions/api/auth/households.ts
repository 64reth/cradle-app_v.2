import { cookie, createSession, hashPin, pinField, slug, textField } from "../auth";
import { authenticateIdentity } from "../auth-provider";
import { conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../http";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    const body = await parseJsonBody(request);
    const householdName = textField(body, "householdName", 1, 120);
    const displayName = textField(body, "displayName", 1, 80);
    let identityAccountId: string | null = null;
    try { identityAccountId = (await authenticateIdentity(request, db)).accountId; } catch { /* Legacy create flow has no identity cookie. */ }
    const pin = identityAccountId ? null : pinField(body);
    if (!identityAccountId && body.pinConfirmation !== pin) throw validationError("Please check the submitted fields.", { pinConfirmation: "PINs must match" });
    const base = slug(householdName);
    if (!base) throw validationError("Please check the submitted fields.", { householdName: "Use letters or numbers" });
    const reference = `${base}-${crypto.randomUUID().slice(0, 6)}`;
    const profileReference = slug(displayName);
    const householdId = crypto.randomUUID();
    const memberId = crypto.randomUUID();
    const accountId = identityAccountId || crypto.randomUUID();
    const now = new Date().toISOString();
    const pinData = pin ? await hashPin(pin) : null;
    const statements = [
      ...(identityAccountId ? [] : [db.prepare(`INSERT INTO user_accounts
        (id, account_reference, display_name, pin_hash, pin_salt, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
        .bind(accountId, `${profileReference}-${crypto.randomUUID().slice(0, 6)}`, displayName,
          pinData?.hash, pinData?.salt, now, now)]),
      db.prepare("INSERT INTO households (id, name, timezone, created_at, updated_at, lookup_reference) VALUES (?, ?, 'UTC', ?, ?, ?)")
        .bind(householdId, householdName, now, now, reference),
      db.prepare(`INSERT INTO members
        (id, household_id, display_name, role, pin_hash, is_active, created_at, updated_at,
          profile_reference, pin_salt, account_id, lifecycle_state, age_group, access_level, age_band)
        VALUES (?, ?, ?, 'owner', NULL, 1, ?, ?, ?, NULL, ?, 'active', 'adult', 'household_admin', 'adult')`)
        .bind(memberId, householdId, displayName, now, now, profileReference, accountId)
    ];
    try {
      await db.batch(statements);
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) {
        throw conflictError("That household or family member reference is unavailable.");
      }
      throw error;
    }
    try {
      await db.prepare("INSERT OR IGNORE INTO profiles (account_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(accountId, displayName, now, now).run();
      await db.prepare("INSERT OR IGNORE INTO profile_preferences (account_id, preferences_json, created_at, updated_at) VALUES (?, '{}', ?, ?)")
        .bind(accountId, now, now).run();
    } catch { /* Compatibility with databases before the operations migration. */ }
    const session = await createSession(db, householdId, memberId, accountId);
    return success({ householdReference: reference, profileReference, expiresAt: session.expiresAt }, requestId, {
      status: 201, headers: { "Set-Cookie": cookie(session.token, env) }
    });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
