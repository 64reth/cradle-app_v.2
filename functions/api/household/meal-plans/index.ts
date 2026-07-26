import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { generateWeeklyMealPlan, parseWeekStart, regenerateWeeklyMealPlan } from "../../meal-planning";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const weekStart = new URL(request.url).searchParams.get("weekStart") || new Date().toISOString().slice(0, 10);
    return success(await generateWeeklyMealPlan(db, identity, parseWeekStart(weekStart)), requestId);
  });
}

export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    const weekStart = parseWeekStart(body.weekStart || new Date().toISOString().slice(0, 10));
    if (body.regenerate) {
      const slotIds = Array.isArray(body.slotIds) ? body.slotIds.filter((id): id is string => typeof id === "string") : undefined;
      return success(await regenerateWeeklyMealPlan(db, identity, weekStart, typeof body.rotationId === "string" ? body.rotationId : undefined, slotIds), requestId);
    }
    return success(await generateWeeklyMealPlan(db, identity, weekStart, typeof body.rotationId === "string" ? body.rotationId : undefined), requestId, { status: 201 });
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
