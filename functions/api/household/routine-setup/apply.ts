import { authenticate } from "../../auth";
import {
  ApiError, conflictError, handleApiRequest, methodNotAllowed, parseJsonBody, requireD1, success, validationError
} from "../../http";
import { dashboardData } from "../../routines";
import { optionalText, requireHouseholdManager } from "../../setup";
import type { CradleEnv, JsonRecord } from "../../types";
import {
  displayRoutineName, isRoutineFrequency, routineTemplate, type RoomType, type RoutineFrequency
} from "../../../../shared/routines";
import type { PetType } from "../../../../shared/pets";

type Context = { request: Request; env: CradleEnv };
type Selection = {
  enabled: boolean; templateKey: string | null; clientKey: string | null;
  roomId: string | null; petId: string | null; frequency: RoutineFrequency;
  ownerMemberId: string; rotationMemberIds: string[]; rotationEnabled: boolean;
  customisedName: string | null; note: string | null; customFrequencyNote: string | null;
};
type Existing = {
  id: string; sourceTemplateKey: string | null; clientKey: string | null;
  roomId: string | null; petId: string | null; status: string; name: string;
};

const optionalId = (row: JsonRecord, key: string): string | null => {
  const value = row[key];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.length > 100) throw validationError("Please check the routine selections.", { [key]: "Choose a valid record" });
  return value;
};
const selectedText = (row: JsonRecord, key: string, max: number): string | null => optionalText(row, key, max);

function parseSelection(value: unknown, index: number): Selection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("Please check the routine selections.", { selections: `Routine ${index + 1} is invalid` });
  }
  const row = value as JsonRecord;
  if (typeof row.enabled !== "boolean") throw validationError("Please check the routine selections.", { enabled: "Choose whether to include this routine" });
  const templateKey = optionalId(row, "templateKey"); const clientKey = optionalId(row, "clientKey");
  if (Boolean(templateKey) === Boolean(clientKey)) {
    throw validationError("Please check the routine selections.", { selections: "Use one template key or one custom routine key" });
  }
  const frequency = row.frequency;
  if (!isRoutineFrequency(frequency)) throw validationError("Please check the routine selections.", { frequency: "Choose how often this happens" });
  const ownerMemberId = optionalId(row, "ownerMemberId");
  if (!ownerMemberId) throw validationError("Please check the routine selections.", { ownerMemberId: "Choose who usually handles this" });
  const rotation = row.rotationMemberIds === undefined ? [] : row.rotationMemberIds;
  if (!Array.isArray(rotation) || rotation.some((id) => typeof id !== "string") || new Set(rotation).size !== rotation.length) {
    throw validationError("Please check the routine selections.", { rotationMemberIds: "Choose each rotating person once" });
  }
  const rotationEnabled = row.rotationEnabled === true;
  if (rotationEnabled && rotation.length < 2) {
    throw validationError("Please check the routine selections.", { rotationMemberIds: "Choose at least two people to rotate" });
  }
  const roomId = optionalId(row, "roomId"); const petId = optionalId(row, "petId");
  if (roomId && petId) throw validationError("Please check the routine selections.", { selections: "Choose a Room or a Pet, not both" });
  return {
    enabled: row.enabled, templateKey, clientKey, roomId, petId, frequency, ownerMemberId,
    rotationMemberIds: rotation as string[], rotationEnabled,
    customisedName: selectedText(row, "customisedName", 100), note: selectedText(row, "note", 1000),
    customFrequencyNote: selectedText(row, "customFrequencyNote", 300)
  };
}

export async function onRequestPost({ request, env }: Context) {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const identity = await authenticate(request, db); requireHouseholdManager(identity);
    if (identity.setupStatus !== "complete") throw new ApiError(409, "SETUP_INCOMPLETE", "Complete household setup before choosing routines.");
    const body = await parseJsonBody(request);
    if (!Array.isArray(body.selections) || body.selections.length > 200) {
      throw validationError("Please check the routine selections.", { selections: "Send up to 200 routines" });
    }
    const selections = body.selections.map(parseSelection);
    if (new Set(selections.map(({ templateKey, clientKey, roomId, petId }) =>
      `${templateKey || `custom:${clientKey}`}|${roomId || ""}|${petId || ""}`)).size !== selections.length) {
      throw validationError("Please check the routine selections.", { selections: "Do not include the same routine twice" });
    }
    const [roomsResult, petsResult, membersResult, existingResult, orderResult] = await Promise.all([
      db.prepare("SELECT id, room_type AS roomType FROM rooms WHERE household_id = ? AND is_active = 1")
        .bind(identity.householdId).all<{ id: string; roomType: RoomType }>(),
      db.prepare("SELECT id, name, pet_type AS petType FROM pets WHERE household_id = ? AND is_active = 1")
        .bind(identity.householdId).all<{ id: string; name: string; petType: PetType }>(),
      db.prepare("SELECT id, role FROM members WHERE household_id = ? AND is_active = 1")
        .bind(identity.householdId).all<{ id: string; role: string }>(),
      db.prepare(`SELECT id, name, source_template_key AS sourceTemplateKey, client_key AS clientKey,
        room_id AS roomId, pet_id AS petId, status FROM household_systems
        WHERE household_id = ? AND status != 'archived'`).bind(identity.householdId).all<Existing>(),
      db.prepare("SELECT COALESCE(MAX(display_order), -1) + 1 AS value FROM household_systems WHERE household_id = ? AND status != 'archived'")
        .bind(identity.householdId).first<{ value: number }>()
    ]);
    const rooms = new Map(roomsResult.results.map((room) => [room.id, room]));
    const pets = new Map(petsResult.results.map((pet) => [pet.id, pet]));
    const eligibleMembers = new Set(membersResult.results.filter(({ role }) => role !== "child").map(({ id }) => id));
    const existingByKey = new Map(existingResult.results.map((system) => [
      system.sourceTemplateKey
        ? `${system.sourceTemplateKey}|${system.roomId || ""}|${system.petId || ""}`
        : `custom:${system.clientKey}|${system.roomId || ""}|${system.petId || ""}`,
      system
    ]));
    const statements: D1PreparedStatement[] = []; const now = new Date().toISOString();
    let nextOrder = orderResult?.value ?? 0;
    for (const selection of selections) {
      if (!eligibleMembers.has(selection.ownerMemberId) ||
        selection.rotationMemberIds.some((memberId) => !eligibleMembers.has(memberId))) {
        throw validationError("Please check the routine selections.", { ownerMemberId: "Choose active eligible Members from this household" });
      }
      const room = selection.roomId ? rooms.get(selection.roomId) : null;
      const pet = selection.petId ? pets.get(selection.petId) : null;
      if (selection.roomId && !room) throw validationError("Please check the routine selections.", { roomId: "Choose an active Room in this household" });
      if (selection.petId && !pet) throw validationError("Please check the routine selections.", { petId: "Choose an active Pet in this household" });
      const key = selection.templateKey
        ? `${selection.templateKey}|${selection.roomId || ""}|${selection.petId || ""}`
        : `custom:${selection.clientKey}|${selection.roomId || ""}|${selection.petId || ""}`;
      const existing = existingByKey.get(key);
      if (!selection.enabled) {
        if (existing) statements.push(db.prepare(`UPDATE household_systems SET status = 'paused', updated_at = ?
          WHERE household_id = ? AND id = ? AND status != 'archived'`).bind(now, identity.householdId, existing.id));
        continue;
      }
      const template = selection.templateKey ? routineTemplate(selection.templateKey) : null;
      if (selection.templateKey && !template) {
        throw validationError("Please check the routine selections.", { templateKey: "Choose a current Cradle recommendation" });
      }
      if (template?.context === "room" && (!room || !template.roomTypes?.includes(room.roomType))) {
        throw validationError("Please check the routine selections.", { roomId: "That recommendation does not match this Room" });
      }
      if (template?.context === "pet" && (!pet || !template.petTypes?.includes(pet.petType))) {
        throw validationError("Please check the routine selections.", { petId: "That recommendation does not match this Pet" });
      }
      if (!template && !selection.customisedName) {
        throw validationError("Please check the routine selections.", { customisedName: "Say what needs doing" });
      }
      const canonicalName = template ? displayRoutineName(template, pet?.name) : selection.customisedName as string;
      const name = selection.customisedName || existing?.name || canonicalName;
      if (existing) {
        statements.push(db.prepare(`UPDATE household_systems SET name = ?, owner_member_id = ?, status = 'active',
          frequency_key = ?, custom_frequency_note = ?, rotation_enabled = ?, notes = ?, template_customised = ?, updated_at = ?
          WHERE household_id = ? AND id = ? AND status != 'archived'`)
          .bind(name, selection.ownerMemberId, selection.frequency, selection.customFrequencyNote,
            selection.rotationEnabled ? 1 : 0, selection.note,
            selection.customisedName && selection.customisedName !== canonicalName ? 1 : 0,
            now, identity.householdId, existing.id));
        statements.push(db.prepare("DELETE FROM household_system_participants WHERE household_id = ? AND system_id = ?")
          .bind(identity.householdId, existing.id));
        for (const memberId of selection.rotationEnabled ? selection.rotationMemberIds : []) {
          statements.push(db.prepare(`INSERT INTO household_system_participants
            (household_id, system_id, member_id, created_at) VALUES (?, ?, ?, ?)`)
            .bind(identity.householdId, existing.id, memberId, now));
        }
        continue;
      }
      const id = crypto.randomUUID();
      const purpose = template ? template.purpose.replace("{pet}", pet?.name || "your pet") : `Keep ${name} part of the household routine.`;
      const definition = template ? template.definitionOfDone.replace("{pet}", pet?.name || "The pet") : `${name} is finished.`;
      statements.push(db.prepare(`INSERT INTO household_systems
        (id, household_id, name, purpose, room_id, pet_id, owner_member_id, status, frequency_key,
          custom_frequency_note, rotation_enabled, estimated_minutes, definition_of_done, notes, display_order,
          source_kind, source_template_key, source_template_version, template_customised, client_key,
          created_at, updated_at, archived_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
        .bind(id, identity.householdId, name, purpose, selection.roomId, selection.petId, selection.ownerMemberId,
          selection.frequency, selection.customFrequencyNote, selection.rotationEnabled ? 1 : 0, template?.estimatedMinutes || 15, definition,
          selection.note, nextOrder++, template ? "template" : "custom", template?.key || null,
          template?.version || null, selection.customisedName && selection.customisedName !== canonicalName ? 1 : 0,
          template ? null : selection.clientKey, now, now));
      const steps = template?.steps || [name];
      steps.forEach((label, displayOrder) => {
        statements.push(db.prepare(`INSERT INTO household_system_steps
          (id, household_id, system_id, label, display_order, is_required, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)`).bind(crypto.randomUUID(), identity.householdId, id, label, displayOrder, now, now));
      });
      for (const memberId of selection.rotationEnabled ? selection.rotationMemberIds : []) {
        statements.push(db.prepare(`INSERT INTO household_system_participants
          (household_id, system_id, member_id, created_at) VALUES (?, ?, ?, ?)`)
          .bind(identity.householdId, id, memberId, now));
      }
    }
    try {
      if (statements.length) await db.batch(statements);
    } catch (error) {
      if (String(error).includes("UNIQUE constraint")) throw conflictError("A routine changed while this setup was being saved. Refresh and try again.");
      throw error;
    }
    return success(await dashboardData(db, identity), requestId);
  });
}

export async function onRequest(context: Context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("POST"); });
}
