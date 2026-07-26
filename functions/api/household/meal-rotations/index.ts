import { authenticate, identityAccessLevel } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { activateRotation, createRotation, mealDuplicateCandidates, mealSuggestions, rotationData } from "../../meal-planning";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const rows = await db.prepare(`SELECT id, title, description, cycle_length_weeks AS cycleLengthWeeks,
        active, starts_on AS startsOn, created_at AS createdAt, updated_at AS updatedAt
      FROM meal_rotations WHERE household_id = ? ORDER BY active DESC, created_at DESC`).bind(identity.householdId).all();
    return success({ rotations: rows.results, active: await rotationData(db, identity.householdId),
      suggestions: await mealSuggestions(db, identity.householdId),
      duplicates: await mealDuplicateCandidates(db, identity.householdId),
      canManage: identityAccessLevel(identity) === "household_admin" }, requestId);
  });
}

export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const id = await createRotation(db, identity, await parseJsonBody(request));
    return success({ id, rotation: await rotationData(db, identity.householdId, id) }, requestId, { status: 201 });
  });
}

export async function onRequestPatch({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    if (body.active === true) await activateRotation(db, identity, String(body.rotationId || ""));
    return success({ active: await rotationData(db, identity.householdId) }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET, POST or PATCH"); });
}
