import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success, validationError } from "../../http";
import { routineSummaries } from "../../routines";
import { requireSystemsViewer } from "../../setup";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); const scope = requireSystemsViewer(identity);
    const requested = new URL(request.url).searchParams.get("status");
    if (requested && !["active", "paused", "archived", "all"].includes(requested)) {
      throw validationError("Choose a supported routine filter.");
    }
    const status = scope === "active" ? "active" : requested && requested !== "all" ? requested : undefined;
    const [routines, members] = await Promise.all([
      routineSummaries(db, identity.householdId, status),
      db.prepare(`SELECT id, display_name AS displayName, role FROM members
        WHERE household_id = ? AND is_active = 1 AND role != 'child' ORDER BY display_name`)
        .bind(identity.householdId).all()
    ]);
    return success({ routines, members: members.results, canManage: scope === "all" }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
