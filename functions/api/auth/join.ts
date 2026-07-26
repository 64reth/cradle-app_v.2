import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody } from "../http";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };

/**
 * Phase 4.2 retires the legacy auto-join endpoint. Invitation acceptance now
 * validates a profile-scoped or household-scoped invite and ambiguous general
 * claims require leadership approval.
 */
export async function onRequestPost({ request }: Context): Promise<Response> {
  return handleApiRequest(request, async () => {
    await parseJsonBody(request);
    throw new ApiError(410, "INVITATION_FLOW_UPDATED",
      "Open the private invitation link or joining code to continue safely.");
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
