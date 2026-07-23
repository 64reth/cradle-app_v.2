import { checkThrottle, clearFailures, cookie, createSession, pinField, recordFailure, textField, throttleKey, verifyPin } from "../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../http";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };
const invalid = () => new ApiError(401, "INVALID_CREDENTIALS", "The household, profile, or PIN was not recognised.");

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
      SELECT m.id, m.household_id AS householdId, m.pin_hash AS pinHash, m.pin_salt AS pinSalt, m.is_active AS isActive
      FROM members m JOIN households h ON h.id = m.household_id
      WHERE lower(h.lookup_reference) = lower(?) AND lower(m.profile_reference) = lower(?) LIMIT 1
    `).bind(householdReference, profileReference).first<{ id: string; householdId: string; pinHash: string | null; pinSalt: string | null; isActive: number }>();
    if (!member || !member.isActive || !member.pinHash || !member.pinSalt || !(await verifyPin(pin, member.pinSalt, member.pinHash))) {
      await recordFailure(db, key);
      throw invalid();
    }
    await clearFailures(db, key);
    const session = await createSession(db, member.householdId, member.id);
    return success({ expiresAt: session.expiresAt }, requestId, { headers: { "Set-Cookie": cookie(session.token, env) } });
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
