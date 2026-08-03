import {
  displayRoutineName, templatesForPet, templatesForRoom, type RoomType, type RoutineFrequency
} from "../../shared/routines";
import type { PetType } from "../../shared/pets";
import type { EventRecurrence, HouseholdEventType } from "../../shared/coordination";
import { identityAccessLevel, type Identity } from "./auth";
import { familyAccess } from "./member-policy";
import { householdRoutineAccess } from "./setup";
import { countIncompleteTasks, dailyProgress, dateInTimezone, householdTasks } from "./tasks";
import type { RoutineAssignmentMode } from "../../shared/assignments";
import { getOrCreateDailyMoments } from "./together";

export type DashboardMember = {
  id: string; displayName: string; preferredName: string | null; role: string;
  accessLevel: string; ageBand: string;
  lifecycleState: string; relationshipLabel: string | null; hasAccount: number;
  avatarId: string | null; avatarFurPaletteKey: string | null;
  avatarPatchPrimaryPaletteKey: string | null; avatarPatchSecondaryPaletteKey: string | null;
  avatarExpressionKey: string | null;
  dailyProgress?: {
    percentage: number; status: string; expression: string; assigned: number;
    complete: number; overdue: number; hasWork: boolean;
  };
};
export type DashboardRoom = { id: string; name: string; roomType: RoomType };
export type DashboardPet = { id: string; name: string; petType: PetType };
export type RoutineSummary = {
  id: string; name: string; status: "draft" | "active" | "paused" | "archived";
  frequency: RoutineFrequency; roomId: string | null; roomName: string | null;
  petId: string | null; petName: string | null; ownerMemberId: string; ownerName: string;
  note: string | null; stepCount: number; sourceKind: "template" | "custom"; sourceTemplateKey: string | null;
  rotationEnabled: boolean; rotationMemberIds: string[];
  assignmentMode: RoutineAssignmentMode; assignedMemberId: string | null; participantMemberIds: string[];
  rotationNextIndex: number;
};
export type RoutineRecommendation = {
  selectionKey: string; templateKey: string; templateVersion: number; contextType: "room" | "pet";
  roomId: string | null; roomName: string | null; petId: string | null; petName: string | null;
  name: string; frequency: RoutineFrequency; estimatedMinutes: number; defaultEnabled: boolean;
  steps: readonly string[]; configuredRoutine: RoutineSummary | null;
  defaultAssignment: "rotate" | "assigned";
};
export type ScheduleEvent = {
  id: string; title: string; eventType: HouseholdEventType; startsAt: string; endsAt: string | null;
  recurrence: EventRecurrence; reminderMinutes: number | null; visibility: "household" | "leadership";
};
const routineSummarySelect = `SELECT s.id, s.name, s.status, s.frequency_key AS frequency,
  s.room_id AS roomId, r.name AS roomName, s.pet_id AS petId, p.name AS petName,
  s.owner_member_id AS ownerMemberId,
  COALESCE(assigned.display_name, owner.display_name) AS ownerName, s.notes AS note,
  s.source_kind AS sourceKind, s.source_template_key AS sourceTemplateKey,
  s.rotation_enabled AS rotationEnabled, a.assignment_mode AS assignmentMode,
  a.assigned_member_id AS assignedMemberId, a.rotation_next_index AS rotationNextIndex,
  (SELECT COUNT(*) FROM household_system_steps st
    WHERE st.household_id = s.household_id AND st.system_id = s.id) AS stepCount
  FROM household_systems s
  JOIN members owner ON owner.household_id = s.household_id AND owner.id = s.owner_member_id
  JOIN routine_assignments a ON a.household_id = s.household_id AND a.system_id = s.id
  LEFT JOIN members assigned ON assigned.household_id = a.household_id AND assigned.id = a.assigned_member_id
  LEFT JOIN rooms r ON r.household_id = s.household_id AND r.id = s.room_id
  LEFT JOIN pets p ON p.household_id = s.household_id AND p.id = s.pet_id`;

export async function routineSummaries(db: D1Database, householdId: string, status?: string): Promise<RoutineSummary[]> {
  const rows = await db.prepare(`${routineSummarySelect} WHERE s.household_id = ?
    ${status ? "AND s.status = ?" : ""} ORDER BY s.display_order, s.created_at`)
    .bind(householdId, ...(status ? [status] : [])).all<Record<string, unknown>>();
  const participants = await db.prepare(`SELECT system_id AS systemId, member_id AS memberId
    FROM routine_assignment_participants WHERE household_id = ? ORDER BY participant_order`)
    .bind(householdId).all<{ systemId: string; memberId: string }>();
  return rows.results.map((row) => ({
    ...row, rotationEnabled: Boolean(row.rotationEnabled),
    rotationMemberIds: participants.results.filter(({ systemId }) => systemId === row.id).map(({ memberId }) => memberId),
    participantMemberIds: participants.results.filter(({ systemId }) => systemId === row.id).map(({ memberId }) => memberId)
  })) as RoutineSummary[];
}

export async function dashboardData(db: D1Database, identity: Identity) {
  const leadership = identityAccessLevel(identity) === "household_admin";
  const [membersResult, roomsResult, petsResult, routines, pendingInvites, joinRequests, openSuggestions,
    upcomingEvents, eventCount] = await Promise.all([
    db.prepare(`SELECT m.id, m.display_name AS displayName, m.preferred_name AS preferredName,
      m.role, m.access_level AS accessLevel, m.age_band AS ageBand, m.lifecycle_state AS lifecycleState,
      m.relationship_label AS relationshipLabel, CASE WHEN m.account_id IS NULL THEN 0 ELSE 1 END AS hasAccount,
      c.id AS avatarId, c.fur_palette_key AS avatarFurPaletteKey,
      c.patch_primary_palette_key AS avatarPatchPrimaryPaletteKey,
      c.patch_secondary_palette_key AS avatarPatchSecondaryPaletteKey,
      c.expression_key AS avatarExpressionKey
      FROM members m
      LEFT JOIN member_companions c ON c.household_id = m.household_id AND c.member_id = m.id AND c.is_active = 1
      WHERE m.household_id = ? AND (m.is_active = 1 OR m.lifecycle_state = 'suspended')
        AND m.lifecycle_state != 'left'
      ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'parent_admin' THEN 1 WHEN 'adult' THEN 2 ELSE 3 END, m.created_at`)
      .bind(identity.householdId).all<DashboardMember>(),
    db.prepare(`SELECT id, name, room_type AS roomType FROM rooms
      WHERE household_id = ? AND is_active = 1 ORDER BY display_order, created_at`).bind(identity.householdId).all<DashboardRoom>(),
    db.prepare(`SELECT id, name, pet_type AS petType FROM pets
      WHERE household_id = ? AND is_active = 1 ORDER BY created_at`).bind(identity.householdId).all<DashboardPet>(),
    routineSummaries(db, identity.householdId),
    db.prepare(`SELECT COUNT(*) AS value FROM household_invites
      WHERE household_id = ? AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > ?`)
      .bind(identity.householdId, new Date().toISOString()).first<{ value: number }>(),
    db.prepare(`SELECT COUNT(*) AS value FROM household_join_requests
      WHERE household_id = ? AND status = 'pending'`).bind(identity.householdId).first<{ value: number }>(),
    db.prepare(`SELECT COUNT(*) AS value FROM task_suggestions
      WHERE household_id = ? AND status = 'open'`).bind(identity.householdId).first<{ value: number }>()
    ,
    db.prepare(`SELECT id, title, event_type AS eventType, starts_at AS startsAt, ends_at AS endsAt,
      recurrence_key AS recurrence, reminder_minutes AS reminderMinutes, visibility
      FROM household_events WHERE household_id = ? AND status = 'active' AND starts_at >= ?
      ${leadership ? "" : "AND visibility = 'household'"}
      ORDER BY starts_at LIMIT 3`).bind(identity.householdId, new Date().toISOString()).all<ScheduleEvent>(),
    db.prepare(`SELECT COUNT(*) AS value FROM household_events
      WHERE household_id = ? AND status = 'active' AND starts_at >= ?
      ${leadership ? "" : "AND visibility = 'household'"}`)
      .bind(identity.householdId, new Date().toISOString()).first<{ value: number }>()
  ]);
  const members = membersResult.results; const rooms = roomsResult.results; const pets = petsResult.results;
  const currentDate = dateInTimezone(identity.householdTimezone || "UTC");
  const [progress, incompleteTaskCount, todayTasks] = await Promise.all([
    dailyProgress(db, identity.householdId, members.map(({ id }) => id), identity.householdTimezone || "UTC"),
    countIncompleteTasks(db, identity.householdId, currentDate),
    householdTasks(db, identity.householdId, currentDate)
  ]);
  for (const member of members) {
    const value = progress.find(({ memberId }) => memberId === member.id);
    if (value) member.dailyProgress = value;
  }
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
      defaultAssignment: template.defaultAssignment,
      configuredRoutine: existing.get(`${template.key}|${room.id}|`) || null
    }))),
    ...pets.flatMap((pet) => templatesForPet(pet.petType).map((template) => ({
      selectionKey: `${template.key}:pet:${pet.id}`, templateKey: template.key, templateVersion: template.version,
      contextType: "pet" as const, roomId: null, roomName: null, petId: pet.id, petName: pet.name,
      name: displayRoutineName(template, pet.name), frequency: template.defaultFrequency,
      estimatedMinutes: template.estimatedMinutes, defaultEnabled: template.defaultEnabled, steps: template.steps,
      defaultAssignment: template.defaultAssignment,
      configuredRoutine: existing.get(`${template.key}||${pet.id}`) || null
    })))
  ];
  const liveRoutines = routines.filter(({ status }) => status !== "archived");
  const activeRoutines = routines.filter(({ status }) => status === "active");
  const routinesChosen = liveRoutines.length > 0;
  const readyForPlanning = rooms.length > 0 && members.length > 0 && activeRoutines.length > 0;
  const setupSteps = [
    { key: "household", label: "Household created", complete: true },
    { key: "rooms", label: "Rooms added", complete: rooms.length > 0 },
    { key: "members", label: "Family added", complete: members.length > 0 },
    ...(pets.length ? [{ key: "pets", label: "Pets added", complete: true }] : []),
    { key: "routines", label: "Routines chosen", complete: routinesChosen },
    { key: "planning", label: "Ready for planning", complete: readyForPlanning }
  ];
  const visibleRoutines = canManage ? liveRoutines : access === "view_active" ? activeRoutines : [];
  let together: { localDate: string; moments: unknown[] } | undefined;
  try { together = await getOrCreateDailyMoments(db, identity); }
  catch { together = undefined; }
  return {
    household: {
      name: identity.householdName,
      reference: identity.householdReference,
      timezone: identity.householdTimezone || "UTC"
    },
    currentUser: { id: identity.memberId, displayName: identity.displayName, role: identity.role,
      accessLevel: identity.accessLevel, ageBand: identity.ageBand },
    members, rooms, pets,
    family: {
      canManage: familyAccess(identity) === "manage",
      pendingInviteCount: familyAccess(identity) === "manage" ? pendingInvites?.value || 0 : 0,
      joinRequestCount: familyAccess(identity) === "manage" ? joinRequests?.value || 0 : 0
    },
    suggestions: {
      canReview: familyAccess(identity) === "manage",
      openCount: familyAccess(identity) === "manage" ? openSuggestions?.value || 0 : 0
    },
    schedule: {
      canCreate: identity.accessLevel !== "managed_member",
      canCreateLeadership: leadership,
      upcomingCount: eventCount?.value || 0,
      upcoming: upcomingEvents.results
    },
    setup: {
      canManage,
      routinesChosen,
      readyForPlanning,
      complete: setupSteps.every(({ complete }) => complete),
      steps: setupSteps
    },
    recommendations: canManage ? recommendations : [],
    routines: visibleRoutines,
    activeRoutineCount: activeRoutines.length,
    incompleteTaskCount,
    todayMissions: todayTasks,
    together,
    todayMission: access === "none"
      ? { state: "waiting", message: "Household planning is managed by your household leaders." }
      : incompleteTaskCount
      ? { state: "ready", message: `${incompleteTaskCount} household ${incompleteTaskCount === 1 ? "mission" : "missions"} remaining today.` }
      : activeRoutines.length
        ? { state: "ready", message: "Today’s household missions are complete." }
      : { state: "setup", message: "Choose a few household routines and Cradle will build your daily plan." },
    currentDate,
    deferredModules: ["Plan", "Messages"]
  };
}
