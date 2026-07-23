import { isPetType } from "../../../../shared/pets";
import { authenticate, textField } from "../../auth";
import { ApiError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { optionalText, requireHouseholdManager, requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv; params: { petId: string } };
async function permit(db: D1Database, identity: Awaited<ReturnType<typeof authenticate>>) {
  if (identity.setupStatus === "incomplete") await requireStep(db, identity, "pets");
  else requireHouseholdManager(identity);
}
export async function onRequestPatch({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); await permit(db, identity);
    const body = await parseJsonBody(request); const name = textField(body, "name", 1, 80);
    if (!isPetType(body.petType)) throw validationError("Please check the submitted fields.", { petType: "Choose a supported pet type" });
    const breed = optionalText(body, "breed", 120); const notes = optionalText(body, "notes", 1000);
    const result = await db.prepare("UPDATE pets SET name = ?, pet_type = ?, breed = ?, notes = ?, updated_at = ? WHERE household_id = ? AND id = ? AND is_active = 1")
      .bind(name, body.petType, breed, notes, new Date().toISOString(), identity.householdId, params.petId).run();
    if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "Pet not found.");
    return success({ updated: true }, requestId);
  });
}
export async function onRequestDelete({ request, env, params }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); await permit(db, identity);
    await parseJsonBody(request);
    const result = await db.prepare("UPDATE pets SET is_active = 0, updated_at = ? WHERE household_id = ? AND id = ? AND is_active = 1")
      .bind(new Date().toISOString(), identity.householdId, params.petId).run();
    if (!result.meta.changes) throw new ApiError(404, "NOT_FOUND", "Pet not found.");
    return success({ deactivated: true }, requestId);
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "PATCH") return onRequestPatch(context);
  if (context.request.method === "DELETE") return onRequestDelete(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("PATCH or DELETE"); });
}
