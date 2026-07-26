import { authenticate } from "../../auth";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../../http";
import { requireFamilyManager } from "../../member-policy";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireFamilyManager(identity);
    const result = await db.prepare(`SELECT j.id, j.requested_member_id AS requestedMemberId,
      COALESCE(m.display_name, j.proposed_display_name, a.display_name) AS displayName,
      m.display_name AS requestedMemberName, j.proposed_display_name AS proposedDisplayName,
      j.status, j.created_at AS createdAt
      FROM household_join_requests j
      JOIN user_accounts a ON a.id = j.account_id
      LEFT JOIN members m ON m.household_id = j.household_id AND m.id = j.requested_member_id
      WHERE j.household_id = ? AND j.status = 'pending' ORDER BY j.created_at`)
      .bind(identity.householdId).all();
    return success({ requests: result.results }, requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
