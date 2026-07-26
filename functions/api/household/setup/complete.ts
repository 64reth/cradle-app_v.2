import { authenticate } from "../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { requireStep, setupState } from "../../setup";
import type { CradleEnv } from "../../types";
import { generateRoutineDraft } from "../../routine-generation";
import { generateTodayTasks } from "../../tasks";
type Context = { request: Request; env: CradleEnv };
export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    await parseJsonBody(request); await requireStep(db, identity, "review");
    const state = await setupState(db, identity.householdId);
    const room = await db.prepare("SELECT id FROM rooms WHERE household_id = ? AND is_active = 1 LIMIT 1").bind(identity.householdId).first();
    if (!state?.leadershipConfirmedAt || !state.membershipReviewedAt || !room) {
      throw new ApiError(409, "SETUP_INCOMPLETE", "Complete Leadership, Family and Rooms first.");
    }
    const owner = await db.prepare("SELECT id FROM members WHERE household_id = ? AND id = ? AND role = 'owner' AND is_active = 1")
      .bind(identity.householdId, identity.memberId).first();
    if (!owner) throw new ApiError(403, "AUTHORIZATION_ERROR", "Only the active Owner can complete setup.");
    const avatar = await db.prepare(`SELECT id FROM member_companions
      WHERE household_id = ? AND member_id = ? AND is_active = 1 LIMIT 1`)
      .bind(identity.householdId, identity.memberId).first();
    if (!avatar) throw new ApiError(409, "AVATAR_REQUIRED", "Create your cat before completing your home setup.");
    const now = new Date().toISOString();
    await db.prepare("UPDATE households SET setup_status = 'complete', setup_step = 'complete', setup_completed_at = ?, updated_at = ? WHERE id = ? AND setup_status = 'incomplete'")
      .bind(now, now, identity.householdId).run();
    await generateRoutineDraft(db, identity.householdId);
    await generateTodayTasks(db, identity.householdId, identity.householdTimezone || "UTC");
    return success({ status: "complete", completedAt: now }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
