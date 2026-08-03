import type { Identity } from "./auth";
import { ApiError, validationError } from "./http";
import { optionalText, requireHouseholdManager } from "./setup";
import type { JsonRecord } from "./types";
import { isRoomType, isRoutineFrequency, routineCategory, routineRoomMismatch, type RoomType, type RoutineFrequency } from "../../shared/routines";
import { isRoutineAssignmentMode, type RoutineAssignmentMode } from "../../shared/assignments";

export type RoutineDetail = {
  id: string; name: string; purpose: string; status: string; frequency: RoutineFrequency;
  customFrequencyNote: string | null;
  roomId: string | null; roomName: string | null; petId: string | null; petName: string | null;
  roomType: RoomType | null; category: string; updatedAt: string;
  allocationWarning: string | null;
  ownerMemberId: string; ownerName: string; note: string | null; definitionOfDone: string;
  estimatedMinutes: number; sourceKind: string; sourceTemplateKey: string | null;
  templateCustomised: boolean; rotationEnabled: boolean; assignmentMode: RoutineAssignmentMode;
  assignedMemberId: string | null;
  steps: Array<{ id: string; label: string; displayOrder: number }>;
  rotationMembers: Array<{ memberId: string; displayName: string; participantOrder: number }>;
};

export async function getRoutineDetail(db: D1Database, householdId: string, systemId: string): Promise<RoutineDetail> {
  const routine = await db.prepare(`SELECT s.id, s.name, s.purpose, s.status, s.frequency_key AS frequency,
    s.custom_frequency_note AS customFrequencyNote,
    s.room_id AS roomId, r.name AS roomName, r.room_type AS roomType, s.pet_id AS petId, p.name AS petName,
    s.owner_member_id AS ownerMemberId, m.display_name AS ownerName, s.notes AS note,
    s.definition_of_done AS definitionOfDone, s.estimated_minutes AS estimatedMinutes,
    s.source_kind AS sourceKind, s.source_template_key AS sourceTemplateKey,
    s.template_customised AS templateCustomised, s.rotation_enabled AS rotationEnabled,
    a.assignment_mode AS assignmentMode, a.assigned_member_id AS assignedMemberId, s.updated_at AS updatedAt
    FROM household_systems s
    JOIN routine_assignments a ON a.household_id = s.household_id AND a.system_id = s.id
    JOIN members m ON m.household_id = s.household_id AND m.id = s.owner_member_id
    LEFT JOIN rooms r ON r.household_id = s.household_id AND r.id = s.room_id
    LEFT JOIN pets p ON p.household_id = s.household_id AND p.id = s.pet_id
    WHERE s.household_id = ? AND s.id = ?`).bind(householdId, systemId).first<Record<string, unknown>>();
  if (!routine) throw new ApiError(404, "NOT_FOUND", "Routine not found.");
  const [steps, rotationMembers] = await Promise.all([
    db.prepare(`SELECT id, label, display_order AS displayOrder FROM household_system_steps
      WHERE household_id = ? AND system_id = ? ORDER BY display_order`).bind(householdId, systemId).all(),
    db.prepare(`SELECT p.member_id AS memberId, m.display_name AS displayName,
      p.participant_order AS participantOrder
      FROM routine_assignment_participants p
      JOIN members m ON m.household_id = p.household_id AND m.id = p.member_id
      WHERE p.household_id = ? AND p.system_id = ? ORDER BY p.participant_order`).bind(householdId, systemId).all()
  ]);
  return {
    ...routine, templateCustomised: Boolean(routine.templateCustomised), rotationEnabled: Boolean(routine.rotationEnabled),
    category: routineCategory(String(routine.name), (routine.roomType || null) as RoomType | null, String(routine.sourceTemplateKey || "")),
    allocationWarning: routineRoomMismatch(String(routine.name), (routine.roomType || null) as RoomType | null),
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
  const roomId = typeof body.roomId === "string" && body.roomId ? body.roomId : null;
  if (roomId) {
    const room = await db.prepare(`SELECT room_type AS roomType FROM rooms
      WHERE household_id = ? AND id = ? AND is_active = 1`).bind(identity.householdId, roomId).first<{ roomType: string }>();
    if (!room || !isRoomType(room.roomType)) throw validationError("Please check this routine.", { roomId: "Choose an active room" });
  }
  if (body.status !== "active" && body.status !== "paused") {
    throw validationError("Please check this routine.", { status: "Choose active or paused" });
  }
  const assignmentMode = body.assignmentMode === undefined
    ? body.assignmentStrategy === "rotate" ? "rotation" : "one_person"
    : body.assignmentMode;
  if (!isRoutineAssignmentMode(assignmentMode)) {
    throw validationError("Please check this routine.", { assignmentMode: "Choose how this Routine is shared" });
  }
  const eligible = await db.prepare(`SELECT id FROM members
    WHERE household_id = ? AND is_active = 1 AND lifecycle_state NOT IN ('left','suspended')`)
    .bind(identity.householdId).all<{ id: string }>();
  const eligibleIds = new Set(eligible.results.map(({ id }) => id));
  const assignedMemberId = typeof body.assignedMemberId === "string" ? body.assignedMemberId :
    typeof body.ownerMemberId === "string" ? body.ownerMemberId : null;
  const participantMemberIds = body.participantMemberIds === undefined
    ? body.rotationMemberIds === undefined ? [] : body.rotationMemberIds : body.participantMemberIds;
  if (!Array.isArray(participantMemberIds) || participantMemberIds.some((id) => typeof id !== "string") ||
    new Set(participantMemberIds).size !== participantMemberIds.length ||
    participantMemberIds.some((id) => !eligibleIds.has(id))) {
    throw validationError("Please check this routine.", { participantMemberIds: "Choose active Family members once" });
  }
  if (assignmentMode === "one_person" && (!assignedMemberId || !eligibleIds.has(assignedMemberId))) {
    throw validationError("Please check this routine.", { assignedMemberId: "Choose one active Family member" });
  }
  if (assignmentMode === "rotation" && participantMemberIds.length < 1) {
    throw validationError("Please check this routine.", { participantMemberIds: "Choose at least one person for Rotation" });
  }
  if (assignmentMode === "shared_team" && participantMemberIds.length < 2) {
    throw validationError("Please check this routine.", { participantMemberIds: "Choose at least two people for a Shared team" });
  }
  return {
    name: name.trim(), frequency: body.frequency, status: body.status, assignmentMode, roomId,
    assignedMemberId: assignmentMode === "one_person" ? assignedMemberId : null,
    participantMemberIds: assignmentMode === "rotation" || assignmentMode === "shared_team"
      ? participantMemberIds as string[] : [],
    note: optionalText(body, "note", 1000), customFrequencyNote: optionalText(body, "customFrequencyNote", 300)
  };
}
