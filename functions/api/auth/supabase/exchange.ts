import { cookie, createSession } from "../../auth";
import {
  createIdentitySession, identityCookie, recordAuthEvent, supabaseUser,
  synchroniseProviderAccount
} from "../../auth-provider";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

function authSchemaError(error: unknown): ApiError | null {
  const message = String(error).toLowerCase();
  return message.includes("no such table") || message.includes("no such column") || message.includes("doesn't exist")
    ? new ApiError(503, "AUTH_SCHEMA_UNAVAILABLE", "Sign-in needs the latest Cradle database migration before it can continue.")
    : null;
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const body = await parseJsonBody(request);
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    if (accessToken.length < 20 || accessToken.length > 4096) throw validationError("Please try signing in again.");
    const user = await supabaseUser(accessToken, env); const db = requireD1(env);
    let sync;
    try {
      sync = await synchroniseProviderAccount(db, user);
    } catch (error) {
      const schemaError = authSchemaError(error);
      if (schemaError) throw schemaError;
      throw error;
    }
    const { account, external, profileCreated } = sync;
    if (account.status !== "active") {
      await recordAuthEvent(db, { accountId: account.id, eventName: "login_failure", provider: external.provider, result: "failure", safeCode: "ACCOUNT_UNAVAILABLE", requestId });
      throw new ApiError(403, "ACCOUNT_UNAVAILABLE", "This Cradle account is not available right now.");
    }
    let identitySession: { token: string; expiresAt: string };
    try {
      identitySession = await createIdentitySession(db, account.id);
    } catch (error) {
      const schemaError = authSchemaError(error);
      if (schemaError) throw schemaError;
      throw error;
    }
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
