import { checkThrottle, clearFailures, cookie, createSession, pinField, recordFailure, textField, throttleKey, verifyPin } from "../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../http";
import { recordAuthEvent } from "../auth-provider";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };
const invalid = () => new ApiError(401, "INVALID_CREDENTIALS", "The household, family member, or PIN was not recognised.");

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    const body = await parseJsonBody(request);
    const householdReference = textField(body, "householdReference", 1, 64);
    const profileReference = textField(body, "profileReference", 1, 64);
    const pin = pinField(body);
    const key = await throttleKey(request, householdReference, profileReference);
    await checkThrottle(db, key);
    const member = await db.prepare(`
      SELECT m.id, m.household_id AS householdId, m.account_id AS accountId,
        COALESCE(a.pin_hash, m.pin_hash) AS pinHash, COALESCE(a.pin_salt, m.pin_salt) AS pinSalt,
        m.is_active AS isActive, m.lifecycle_state AS lifecycleState
      FROM members m JOIN households h ON h.id = m.household_id
      LEFT JOIN user_accounts a ON a.id = m.account_id AND a.is_active = 1
      WHERE lower(h.lookup_reference) = lower(?) AND lower(m.profile_reference) = lower(?) LIMIT 1
    `).bind(householdReference, profileReference).first<{ id: string; householdId: string; accountId: string | null;
      pinHash: string | null; pinSalt: string | null; isActive: number; lifecycleState: string }>();
    if (!member || !member.isActive || ["suspended", "left"].includes(member.lifecycleState) ||
      !member.pinHash || !member.pinSalt || !(await verifyPin(pin, member.pinSalt, member.pinHash))) {
      await recordFailure(db, key);
      await recordAuthEvent(db, { eventName: "login_failure", provider: "legacy_pin", result: "failure", safeCode: "INVALID_CREDENTIALS", requestId });
      throw invalid();
    }
    await clearFailures(db, key);
    const session = await createSession(db, member.householdId, member.id, member.accountId);
    await recordAuthEvent(db, { accountId: member.accountId, householdId: member.householdId, memberId: member.id,
      eventName: "login_success", provider: "legacy_pin", result: "success", requestId });
    return success({ expiresAt: session.expiresAt }, requestId, { headers: { "Set-Cookie": cookie(session.token, env) } });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
