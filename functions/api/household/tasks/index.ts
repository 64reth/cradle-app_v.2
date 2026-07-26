import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../../http";
import { countIncompleteTasks, dateInTimezone, generateTodayTasks, personalTasks } from "../../tasks";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const timezone = identity.householdTimezone || "UTC";
    await generateTodayTasks(db, identity.householdId, timezone);
    const date = dateInTimezone(timezone);
    const [tasks, incomplete] = await Promise.all([
      personalTasks(db, identity.householdId, identity.memberId, date),
      countIncompleteTasks(db, identity.householdId, date)
    ]);
    return success({ date, tasks, incomplete }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
