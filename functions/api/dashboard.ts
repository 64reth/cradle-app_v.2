import { authenticate } from "./auth";
import { ApiError, handleApiRequest, methodNotAllowed, requireD1, success } from "./http";
import { dashboardData } from "./routines";
import { generateRoutineDraft } from "./routine-generation";
import { generateTodayTasks, refreshDailyTaskStates } from "./tasks";
import type { CradleEnv } from "./types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    if (identity.setupStatus !== "complete") {
      throw new ApiError(409, "SETUP_INCOMPLETE", "Complete household setup before opening the Dashboard.");
    }
    await generateRoutineDraft(db, identity.householdId);
    await refreshDailyTaskStates(db, identity.householdId, identity.householdTimezone || "UTC");
    await generateTodayTasks(db, identity.householdId, identity.householdTimezone || "UTC");
    return success(await dashboardData(db, identity), requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
