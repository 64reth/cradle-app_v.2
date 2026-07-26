import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success } from "../../http";
import { confirmWeeklyPlan, refreshShoppingList, updateWeeklySlot, weeklyPlanData } from "../../meal-planning";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv; params: { planId: string } };

export async function onRequestGet({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    return success(await weeklyPlanData(db, identity.householdId, params.planId), requestId);
  });
}

export async function onRequestPatch({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const body = await parseJsonBody(request);
    if (body.refreshShoppingList) return success({ items: await refreshShoppingList(db, identity.householdId, params.planId) }, requestId);
    if (body.confirmWeek) return success(await confirmWeeklyPlan(db, identity, params.planId), requestId);
    const slotId = typeof body.slotId === "string" ? body.slotId : "";
    return success(await updateWeeklySlot(db, identity, params.planId, slotId, body), requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "PATCH") return onRequestPatch(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or PATCH"); });
}
