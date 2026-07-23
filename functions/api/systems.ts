import type { Identity } from "./auth";
import { ApiError, validationError } from "./http";
import { optionalText, requireHouseholdManager } from "./setup";
import type { JsonRecord } from "./types";
import { isRoutineFrequency, type RoutineFrequency } from "../../shared/routines";

export type RoutineDetail = {
  id: string; name: string; purpose: string; status: string; frequency: RoutineFrequency;
  customFrequencyNote: string | null;
  roomId: string | null; roomName: string | null; petId: string | null; petName: string | null;
  ownerMemberId: string; ownerName: string; note: string | null; definitionOfDone: string;
  estimatedMinutes: number; sourceKind: string; sourceTemplateKey: string | null;
  templateCustomised: boolean; rotationEnabled: boolean;
  steps: Array<{ id: string; label: string; displayOrder: number }>;
  rotationMembers: Array<{ memberId: string; displayName: string }>;
};

export async function getRoutineDetail(db: D1Database, householdId: string, systemId: string): Promise<RoutineDetail> {
  const routine = await db.prepare(`SELECT s.id, s.name, s.purpose, s.status, s.frequency_key AS frequency,
    s.custom_frequency_note AS customFrequencyNote,
    s.room_id AS roomId, r.name AS roomName, s.pet_id AS petId, p.name AS petName,
    s.owner_member_id AS ownerMemberId, m.display_name AS ownerName, s.notes AS note,
    s.definition_of_done AS definitionOfDone, s.estimated_minutes AS estimatedMinutes,
    s.source_kind AS sourceKind, s.source_template_key AS sourceTemplateKey,
    s.template_customised AS templateCustomised, s.rotation_enabled AS rotationEnabled
    FROM household_systems s
    JOIN members m ON m.household_id = s.household_id AND m.id = s.owner_member_id
    LEFT JOIN rooms r ON r.household_id = s.household_id AND r.id = s.room_id
    LEFT JOIN pets p ON p.household_id = s.household_id AND p.id = s.pet_id
    WHERE s.household_id = ? AND s.id = ?`).bind(householdId, systemId).first<Record<string, unknown>>();
  if (!routine) throw new ApiError(404, "NOT_FOUND", "Routine not found.");
  const [steps, rotationMembers] = await Promise.all([
    db.prepare(`SELECT id, label, display_order AS displayOrder FROM household_system_steps
      WHERE household_id = ? AND system_id = ? ORDER BY display_order`).bind(householdId, systemId).all(),
    db.prepare(`SELECT p.member_id AS memberId, m.display_name AS displayName
      FROM household_system_participants p
      JOIN members m ON m.household_id = p.household_id AND m.id = p.member_id
      WHERE p.household_id = ? AND p.system_id = ? ORDER BY m.display_name`).bind(householdId, systemId).all()
  ]);
  return {
    ...routine, templateCustomised: Boolean(routine.templateCustomised), rotationEnabled: Boolean(routine.rotationEnabled),
    steps: steps.results, rotationMembers: rotationMembers.results
  } as RoutineDetail;
}

export async function parseRoutineEdit(body: JsonRecord, db: D1Database, identity: Identity) {
  requireHouseholdManager(identity);
  const name = body.name;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    throw validationError("Please check this routine.", { name: "Use a name up to 100 characters" });
  }
  if (!isRoutineFrequency(body.frequency)) {
    throw validationError("Please check this routine.", { frequency: "Choose how often it happens" });
  }
  if (body.status !== "active" && body.status !== "paused") {
    throw validationError("Please check this routine.", { status: "Choose active or paused" });
  }
  if (typeof body.ownerMemberId !== "string") {
    throw validationError("Please check this routine.", { ownerMemberId: "Choose who usually handles this" });
  }
  const owner = await db.prepare(`SELECT role FROM members
    WHERE household_id = ? AND id = ? AND is_active = 1`).bind(identity.householdId, body.ownerMemberId).first<{ role: string }>();
  if (!owner || owner.role === "child") {
    throw validationError("Please check this routine.", { ownerMemberId: "Choose an eligible household Member" });
  }
  return {
    name: name.trim(), frequency: body.frequency, status: body.status, ownerMemberId: body.ownerMemberId,
    note: optionalText(body, "note", 1000), customFrequencyNote: optionalText(body, "customFrequencyNote", 300)
  };
}
