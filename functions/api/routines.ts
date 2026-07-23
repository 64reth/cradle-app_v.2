import {
  displayRoutineName, templatesForPet, templatesForRoom, type RoomType, type RoutineFrequency
} from "../../shared/routines";
import type { PetType } from "../../shared/pets";
import type { Identity } from "./auth";
import { householdRoutineAccess } from "./setup";

export type DashboardMember = { id: string; displayName: string; role: string };
export type DashboardRoom = { id: string; name: string; roomType: RoomType };
export type DashboardPet = { id: string; name: string; petType: PetType };
export type RoutineSummary = {
  id: string; name: string; status: "draft" | "active" | "paused" | "archived";
  frequency: RoutineFrequency; roomId: string | null; roomName: string | null;
  petId: string | null; petName: string | null; ownerMemberId: string; ownerName: string;
  note: string | null; stepCount: number; sourceKind: "template" | "custom"; sourceTemplateKey: string | null;
  rotationEnabled: boolean; rotationMemberIds: string[];
};
export type RoutineRecommendation = {
  selectionKey: string; templateKey: string; templateVersion: number; contextType: "room" | "pet";
  roomId: string | null; roomName: string | null; petId: string | null; petName: string | null;
  name: string; frequency: RoutineFrequency; estimatedMinutes: number; defaultEnabled: boolean;
  steps: readonly string[]; configuredRoutine: RoutineSummary | null;
};

const routineSummarySelect = `SELECT s.id, s.name, s.status, s.frequency_key AS frequency,
  s.room_id AS roomId, r.name AS roomName, s.pet_id AS petId, p.name AS petName,
  s.owner_member_id AS ownerMemberId, m.display_name AS ownerName, s.notes AS note,
  s.source_kind AS sourceKind, s.source_template_key AS sourceTemplateKey,
  s.rotation_enabled AS rotationEnabled,
  (SELECT COUNT(*) FROM household_system_steps st
    WHERE st.household_id = s.household_id AND st.system_id = s.id) AS stepCount
  FROM household_systems s
  JOIN members m ON m.household_id = s.household_id AND m.id = s.owner_member_id
  LEFT JOIN rooms r ON r.household_id = s.household_id AND r.id = s.room_id
  LEFT JOIN pets p ON p.household_id = s.household_id AND p.id = s.pet_id`;

export async function routineSummaries(db: D1Database, householdId: string, status?: string): Promise<RoutineSummary[]> {
  const rows = await db.prepare(`${routineSummarySelect} WHERE s.household_id = ?
    ${status ? "AND s.status = ?" : ""} ORDER BY s.display_order, s.created_at`)
    .bind(householdId, ...(status ? [status] : [])).all<Record<string, unknown>>();
  const participants = await db.prepare(`SELECT system_id AS systemId, member_id AS memberId
    FROM household_system_participants WHERE household_id = ?`).bind(householdId).all<{ systemId: string; memberId: string }>();
  return rows.results.map((row) => ({
    ...row, rotationEnabled: Boolean(row.rotationEnabled),
    rotationMemberIds: participants.results.filter(({ systemId }) => systemId === row.id).map(({ memberId }) => memberId)
  })) as RoutineSummary[];
}

export async function dashboardData(db: D1Database, identity: Identity) {
  const [membersResult, roomsResult, petsResult, companion, routines] = await Promise.all([
    db.prepare(`SELECT id, display_name AS displayName, role FROM members
      WHERE household_id = ? AND is_active = 1 ORDER BY created_at`).bind(identity.householdId).all<DashboardMember>(),
    db.prepare(`SELECT id, name, room_type AS roomType FROM rooms
      WHERE household_id = ? AND is_active = 1 ORDER BY display_order, created_at`).bind(identity.householdId).all<DashboardRoom>(),
    db.prepare(`SELECT id, name, pet_type AS petType FROM pets
      WHERE household_id = ? AND is_active = 1 ORDER BY created_at`).bind(identity.householdId).all<DashboardPet>(),
    db.prepare(`SELECT id, name, fur_palette_key AS furPaletteKey, patch_primary_palette_key AS patchPrimaryPaletteKey,
      patch_secondary_palette_key AS patchSecondaryPaletteKey, expression_key AS expressionKey
      FROM companions WHERE household_id = ? AND is_active = 1 LIMIT 1`).bind(identity.householdId).first(),
    routineSummaries(db, identity.householdId)
  ]);
  const members = membersResult.results; const rooms = roomsResult.results; const pets = petsResult.results;
  const access = householdRoutineAccess(identity);
  const canManage = access === "manage";
  const existing = new Map(routines.filter(({ sourceTemplateKey }) => sourceTemplateKey).map((routine) => [
    `${routine.sourceTemplateKey}|${routine.roomId || ""}|${routine.petId || ""}`, routine
  ]));
  const recommendations: RoutineRecommendation[] = [
    ...rooms.flatMap((room) => templatesForRoom(room.roomType).map((template) => ({
      selectionKey: `${template.key}:room:${room.id}`, templateKey: template.key, templateVersion: template.version,
      contextType: "room" as const, roomId: room.id, roomName: room.name, petId: null, petName: null,
      name: template.name, frequency: template.defaultFrequency, estimatedMinutes: template.estimatedMinutes,
      defaultEnabled: template.defaultEnabled, steps: template.steps,
      configuredRoutine: existing.get(`${template.key}|${room.id}|`) || null
    }))),
    ...pets.flatMap((pet) => templatesForPet(pet.petType).map((template) => ({
      selectionKey: `${template.key}:pet:${pet.id}`, templateKey: template.key, templateVersion: template.version,
      contextType: "pet" as const, roomId: null, roomName: null, petId: pet.id, petName: pet.name,
      name: displayRoutineName(template, pet.name), frequency: template.defaultFrequency,
      estimatedMinutes: template.estimatedMinutes, defaultEnabled: template.defaultEnabled, steps: template.steps,
      configuredRoutine: existing.get(`${template.key}||${pet.id}`) || null
    })))
  ];
  const liveRoutines = routines.filter(({ status }) => status !== "archived");
  const activeRoutines = routines.filter(({ status }) => status === "active");
  const routinesChosen = liveRoutines.length > 0;
  const visibleRoutines = canManage ? liveRoutines : access === "view_active" ? activeRoutines : [];
  return {
    household: { name: identity.householdName, reference: identity.householdReference },
    currentUser: { id: identity.memberId, displayName: identity.displayName, role: identity.role },
    members, rooms, pets, companion,
    setup: {
      canManage,
      routinesChosen,
      readyForPlanning: activeRoutines.length > 0,
      steps: [
        { key: "household", label: "Household created", complete: true },
        { key: "rooms", label: "Rooms added", complete: rooms.length > 0 },
        { key: "members", label: "Family added", complete: members.length > 0 },
        ...(pets.length ? [{ key: "pets", label: "Pets added", complete: true }] : []),
        { key: "routines", label: "Routines chosen", complete: routinesChosen },
        { key: "planning", label: "Ready for planning", complete: activeRoutines.length > 0 }
      ]
    },
    recommendations: canManage ? recommendations : [],
    routines: visibleRoutines,
    activeRoutineCount: activeRoutines.length,
    todayMission: access === "none"
      ? { state: "waiting", message: "Household planning is managed by your household leaders." }
      : activeRoutines.length
      ? { state: "ready", message: "Your routines are ready. Daily missions are coming in the next phase." }
      : { state: "setup", message: "Choose a few household routines and Cradle will build your daily plan." },
    currentDate: new Date().toISOString().slice(0, 10),
    deferredModules: ["Plan", "Calendar", "Messages"]
  };
}
