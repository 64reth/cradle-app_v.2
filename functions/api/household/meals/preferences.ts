import { authenticate, identityAccessLevel } from "../../auth";
import { authorizationError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { mealConstraints } from "../../meal-planning";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };
const value = (input: unknown, max = 600): string | null => {
  if (input === undefined || input === null || input === "") return null;
  if (typeof input !== "string" || input.trim().length > max) throw validationError("Please check the meal preferences.");
  return input.trim() || null;
};

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const rows = await db.prepare(`SELECT member_id AS memberId, dietary_requirements AS dietaryRequirements, allergies, dislikes
      FROM member_meal_preferences WHERE household_id = ? ORDER BY member_id`).bind(identity.householdId).all();
    return success({ preferences: rows.results, constraints: await mealConstraints(db, identity.householdId) }, requestId);
  });
}

export async function onRequestPatch({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    const requestedMemberId = typeof body.memberId === "string" && body.memberId.trim() ? body.memberId.trim() : identity.memberId;
    if (requestedMemberId !== identity.memberId && identityAccessLevel(identity) !== "household_admin") throw authorizationError("Only household leaders can update another member’s meal preferences.");
    const member = await db.prepare("SELECT id FROM members WHERE household_id = ? AND id = ? AND is_active = 1")
      .bind(identity.householdId, requestedMemberId).first();
    if (!member) throw validationError("Choose a current Family member.");
    const now = new Date().toISOString();
    await db.prepare(`INSERT INTO member_meal_preferences
      (household_id, member_id, dietary_requirements, allergies, dislikes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(household_id, member_id) DO UPDATE SET dietary_requirements = excluded.dietary_requirements,
        allergies = excluded.allergies, dislikes = excluded.dislikes, updated_at = excluded.updated_at`)
      .bind(identity.householdId, requestedMemberId, value(body.dietaryRequirements), value(body.allergies), value(body.dislikes), now, now).run();
    return success({ constraints: await mealConstraints(db, identity.householdId) }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or PATCH"); });
}
