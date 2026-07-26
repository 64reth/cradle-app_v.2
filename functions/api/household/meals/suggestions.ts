import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../../http";
import { mealConstraints, mealSuggestions } from "../../meal-planning";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const params = new URL(request.url).searchParams; const scope = params.get("scope") || "meal";
    const date = params.get("date") || undefined;
    return success({ scope, suggestions: await mealSuggestions(db, identity.householdId, { occasionDate: date }),
      constraints: await mealConstraints(db, identity.householdId) }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
