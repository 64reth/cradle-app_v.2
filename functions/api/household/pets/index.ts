import { PET_TYPES, isPetType } from "../../../../shared/pets";
import { authenticate, textField } from "../../auth";
import { handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError } from "../../http";
import { optionalText, requireHouseholdManager, requireStep } from "../../setup";
import type { CradleEnv } from "../../types";
type Context = { request: Request; env: CradleEnv };
export async function onRequestGet({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    const rows = await db.prepare("SELECT id, name, pet_type AS petType, breed, notes FROM pets WHERE household_id = ? AND is_active = 1 ORDER BY created_at")
      .bind(identity.householdId).all();
    return success({ pets: rows.results, petTypes: PET_TYPES }, requestId);
  });
}
export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db);
    if (identity.setupStatus === "incomplete") await requireStep(db, identity, "pets");
    else requireHouseholdManager(identity);
    const body = await parseJsonBody(request); const name = textField(body, "name", 1, 80);
    if (!isPetType(body.petType)) throw validationError("Please check the submitted fields.", { petType: "Choose a supported pet type" });
    const breed = optionalText(body, "breed", 120); const notes = optionalText(body, "notes", 1000);
    const id = crypto.randomUUID(); const now = new Date().toISOString();
    await db.prepare("INSERT INTO pets (id, household_id, name, pet_type, breed, notes, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)")
      .bind(id, identity.householdId, name, body.petType, breed, notes, now, now).run();
    return success({ pet: { id, name, petType: body.petType, breed, notes } }, requestId, { status: 201 });
  });
}
export async function onRequest(context: Context) {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
