import { identityAccessLevel, type Identity } from "./auth";
import type { RoutineAssignmentMode, TaskState } from "../../shared/assignments";

type DailyRoutine = {
  id: string; name: string; roomId: string | null; petId: string | null;
  frequency: string; createdAt: string; assignmentMode: RoutineAssignmentMode;
  assignedMemberId: string | null; rotationNextIndex: number;
};
type AssignmentParticipant = { systemId: string; memberId: string; participantOrder: number };

export function dateInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function weekdayInTimezone(timezone: string, now = new Date()): number {
  const name = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "short" }).format(now);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

function stringSeed(value: string): number {
  let seed = 0;
  for (let index = 0; index < value.length; index += 1) seed = ((seed * 31) + value.charCodeAt(index)) >>> 0;
  return seed;
}

function dueToday(routine: DailyRoutine, date: string, timezone: string, now: Date): boolean {
  const createdAt = new Date(routine.createdAt);
  if (Number.isNaN(createdAt.getTime())) return false;
  const createdDate = dateInTimezone(timezone, createdAt);
  if (createdDate === date) return true;
  const day = weekdayInTimezone(timezone, now);
  if (routine.frequency === "daily") return true;
  if (routine.frequency === "weekdays") return day >= 1 && day <= 5;
  if (routine.frequency === "weekends") return day === 0 || day === 6;
  if (routine.frequency === "twice_weekly") return day === 1 || day === 4;
  if (routine.frequency === "three_weekly") return day === 1 || day === 3 || day === 6;
  if (routine.frequency === "weekly") return stringSeed(routine.id) % 7 === day;
  if (routine.frequency === "fortnightly") {
    const days = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
    return (days + stringSeed(routine.id)) % 14 === 0;
  }
  if (routine.frequency === "monthly") return Number(date.slice(-2)) === (stringSeed(routine.id) % 28) + 1;
  return false;
}

function duePeriod(name: string): "morning" | "afternoon" | "evening" | "anytime" {
  if (/morning/i.test(name)) return "morning";
  if (/evening/i.test(name)) return "evening";
  if (/afternoon/i.test(name)) return "afternoon";
  return "anytime";
}

/**
 * Materialise one shared occurrence per due Routine. Rotation advances only
 * after a new task insert, so refreshes and retries cannot skip a person or
 * reset the carousel.
 */
export async function generateTodayTasks(
  db: D1Database, householdId: string, timezone: string, now = new Date()
): Promise<number> {
  const date = dateInTimezone(timezone, now);
  const [routinesResult, participantsResult, existingResult] = await Promise.all([
    db.prepare(`SELECT s.id, s.name, s.room_id AS roomId, s.pet_id AS petId,
      s.frequency_key AS frequency, s.created_at AS createdAt,
      a.assignment_mode AS assignmentMode, a.assigned_member_id AS assignedMemberId,
      a.rotation_next_index AS rotationNextIndex
      FROM household_systems s
      JOIN routine_assignments a ON a.household_id = s.household_id AND a.system_id = s.id
      WHERE s.household_id = ? AND s.status = 'active' ORDER BY s.display_order, s.created_at`)
      .bind(householdId).all<DailyRoutine>(),
    db.prepare(`SELECT system_id AS systemId, member_id AS memberId, participant_order AS participantOrder
      FROM routine_assignment_participants WHERE household_id = ?
      ORDER BY system_id, participant_order`).bind(householdId).all<AssignmentParticipant>(),
    db.prepare(`SELECT system_id AS systemId FROM household_task_instances
      WHERE household_id = ? AND occurrence_date = ?`).bind(householdId, date).all<{ systemId: string }>()
  ]);
  const existing = new Set(existingResult.results.map(({ systemId }) => systemId));
  let created = 0;
  for (const routine of routinesResult.results) {
    if (existing.has(routine.id) || !dueToday(routine, date, timezone, now)) continue;
    const pool = participantsResult.results.filter(({ systemId }) => systemId === routine.id);
    let assignedMemberId = routine.assignmentMode === "one_person" ? routine.assignedMemberId : null;
    let rotationIndex: number | null = null;
    let required: string[] = [];
    if (routine.assignmentMode === "rotation" && pool.length) {
      rotationIndex = routine.rotationNextIndex % pool.length;
      assignedMemberId = pool[rotationIndex].memberId;
      required = [assignedMemberId];
    } else if (routine.assignmentMode === "shared_team") {
      required = pool.map(({ memberId }) => memberId);
    } else if (routine.assignmentMode === "one_person" && assignedMemberId) {
      required = [assignedMemberId];
    }
    const id = crypto.randomUUID(); const stamp = now.toISOString();
    const statements = [
      db.prepare(`INSERT INTO household_task_instances
        (id, household_id, system_id, occurrence_date, title, room_id, pet_id, assignment_mode,
          assigned_member_id, rotation_index, due_period, due_at, status, completed_at,
          completed_by_member_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'todo', NULL, NULL, ?, ?)`)
        .bind(id, householdId, routine.id, date, routine.name, routine.roomId, routine.petId,
          routine.assignmentMode, assignedMemberId, rotationIndex, duePeriod(routine.name), stamp, stamp),
      ...required.map((memberId) => db.prepare(`INSERT INTO household_task_participants
        (household_id, task_id, member_id, participant_kind, status, completed_at,
          completed_by_member_id, created_at, updated_at)
        VALUES (?, ?, ?, 'required', 'todo', NULL, NULL, ?, ?)`)
        .bind(householdId, id, memberId, stamp, stamp)),
      db.prepare(`INSERT INTO routine_assignment_history
        (id, household_id, system_id, task_id, member_id, assignment_mode, rotation_index,
          occurrence_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), householdId, routine.id, id, assignedMemberId,
          routine.assignmentMode, rotationIndex, date, stamp)
    ];
    if (routine.assignmentMode === "rotation" && pool.length) {
      statements.push(db.prepare(`UPDATE routine_assignments SET rotation_next_index = ?,
        previous_assignee_id = ?, updated_at = ? WHERE household_id = ? AND system_id = ?`)
        .bind(((rotationIndex || 0) + 1) % pool.length, assignedMemberId, stamp, householdId, routine.id));
    }
    try {
      await db.batch(statements);
      existing.add(routine.id); created += 1;
    } catch (error) {
      if (!String(error).includes("UNIQUE constraint")) throw error;
    }
  }
  return created;
}

export type PersonalTask = {
  id: string; title: string; roomName: string | null; petName: string | null;
  duePeriod: string; dueAt: string | null; assignmentMode: RoutineAssignmentMode | "manual";
  state: TaskState; contributionState: Exclude<TaskState, "waiting_for_team">;
  teamCompleted: number; teamTotal: number; participantKind: "required" | "helper";
  helpRequested: boolean;
};

export type HouseholdTask = {
  id: string; title: string; roomName: string | null; petName: string | null;
  duePeriod: string; dueAt: string | null; assignmentMode: RoutineAssignmentMode | "manual";
  state: TaskState; participants: Array<{ memberId: string; memberName: string; status: string; participantKind: "required" | "helper" }>;
};

/** All current-day missions for the household, including their real participant pool. */
export async function householdTasks(db: D1Database, householdId: string, date: string): Promise<HouseholdTask[]> {
  type HouseholdTaskRow = Omit<HouseholdTask, "participants">;
  const [tasks, participants] = await Promise.all([
    db.prepare(`SELECT t.id, t.title, r.name AS roomName, pet.name AS petName,
      t.due_period AS duePeriod, t.due_at AS dueAt, t.assignment_mode AS assignmentMode, t.status AS state
      FROM household_task_instances t
      LEFT JOIN rooms r ON r.household_id = t.household_id AND r.id = t.room_id
      LEFT JOIN pets pet ON pet.household_id = t.household_id AND pet.id = t.pet_id
      WHERE t.household_id = ? AND t.occurrence_date = ?
      ORDER BY CASE t.due_period WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1
        WHEN 'evening' THEN 2 ELSE 3 END, t.created_at`).bind(householdId, date).all<HouseholdTaskRow>(),
    db.prepare(`SELECT tp.task_id AS taskId, tp.member_id AS memberId, m.display_name AS memberName,
      tp.status, tp.participant_kind AS participantKind
      FROM household_task_participants tp
      JOIN members m ON m.household_id = tp.household_id AND m.id = tp.member_id
      WHERE tp.household_id = ? AND EXISTS (
        SELECT 1 FROM household_task_instances t WHERE t.household_id = tp.household_id
          AND t.id = tp.task_id AND t.occurrence_date = ?)
      ORDER BY tp.task_id, tp.participant_kind, m.created_at`).bind(householdId, date)
      .all<{ taskId: string; memberId: string; memberName: string; status: string; participantKind: "required" | "helper" }>()
  ]);
  return tasks.results.map((task) => ({
    ...task,
    participants: participants.results.filter(({ taskId }) => taskId === task.id)
  }));
}

export async function personalTasks(
  db: D1Database, householdId: string, memberId: string, date: string
): Promise<PersonalTask[]> {
  const rows = await db.prepare(`SELECT t.id, t.title, r.name AS roomName, pet.name AS petName,
    t.due_period AS duePeriod, t.due_at AS dueAt, t.assignment_mode AS assignmentMode,
    t.status AS state, tp.status AS contributionState, tp.participant_kind AS participantKind,
    (SELECT COUNT(*) FROM household_task_participants allp
      WHERE allp.household_id = t.household_id AND allp.task_id = t.id
        AND allp.participant_kind = 'required' AND allp.status = 'complete') AS teamCompleted,
    (SELECT COUNT(*) FROM household_task_participants allp
      WHERE allp.household_id = t.household_id AND allp.task_id = t.id
        AND allp.participant_kind = 'required') AS teamTotal,
    CASE WHEN EXISTS(SELECT 1 FROM task_help_requests hr WHERE hr.household_id = t.household_id
      AND hr.task_id = t.id AND hr.requested_by_member_id = ? AND hr.status IN ('requested','accepted'))
      THEN 1 ELSE 0 END AS helpRequested
    FROM household_task_instances t
    JOIN household_task_participants tp ON tp.household_id = t.household_id AND tp.task_id = t.id
      AND tp.member_id = ?
    LEFT JOIN rooms r ON r.household_id = t.household_id AND r.id = t.room_id
    LEFT JOIN pets pet ON pet.household_id = t.household_id AND pet.id = t.pet_id
    WHERE t.household_id = ? AND t.occurrence_date = ?
    ORDER BY CASE t.due_period WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1
      WHEN 'evening' THEN 2 ELSE 3 END, t.created_at`)
    .bind(memberId, memberId, householdId, date).all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    ...row, helpRequested: Boolean(row.helpRequested)
  })) as PersonalTask[];
}

export type DailyProgress = {
  memberId: string; percentage: number; status: string; expression: string;
  assigned: number; complete: number; overdue: number; hasWork: boolean;
};

function periodIsDue(period: string, timezone: string, now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", hourCycle: "h23"
  }).format(now));
  return period === "morning" ? hour >= 12 : period === "afternoon" ? hour >= 18 : false;
}

/**
 * Persist missed work without turning it into a permanent score. Previous-day
 * work is retained as history; current-day periods become missed only after
 * their friendly deadline. A later sign-off can still move either row back to
 * complete.
 */
export async function refreshDailyTaskStates(
  db: D1Database, householdId: string, timezone: string, now = new Date()
): Promise<void> {
  const date = dateInTimezone(timezone, now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, hour: "2-digit", hourCycle: "h23"
  }).format(now));
  const duePeriods = [
    ...(hour >= 12 ? ["morning"] : []),
    ...(hour >= 18 ? ["afternoon"] : []),
    ...(hour >= 22 ? ["evening"] : []),
    ...(hour >= 23 ? ["anytime"] : [])
  ];
  const periodSql = duePeriods.length
    ? `OR (t.occurrence_date = ? AND t.due_period IN (${duePeriods.map(() => "?").join(",")}))`
    : "";
  const participantValues = [
    householdId, date, now.toISOString(), ...(duePeriods.length ? [date, ...duePeriods] : [])
  ];
  const taskPeriodSql = duePeriods.length
    ? `OR (occurrence_date = ? AND due_period IN (${duePeriods.map(() => "?").join(",")}))`
    : "";
  const taskValues = [
    householdId, date, now.toISOString(), ...(duePeriods.length ? [date, ...duePeriods] : [])
  ];
  const stamp = now.toISOString();
  await db.batch([
    db.prepare(`UPDATE household_task_participants AS tp SET status = 'missed', updated_at = ?
      WHERE tp.household_id = ? AND tp.participant_kind = 'required'
        AND tp.status NOT IN ('complete','missed') AND EXISTS (
          SELECT 1 FROM household_task_instances t
          WHERE t.household_id = tp.household_id AND t.id = tp.task_id
            AND (t.occurrence_date < ? OR (t.due_at IS NOT NULL AND t.due_at <= ?) ${periodSql})
        )`).bind(stamp, ...participantValues),
    db.prepare(`UPDATE household_task_instances SET status = 'missed', updated_at = ?
      WHERE household_id = ? AND status != 'complete'
        AND (occurrence_date < ? OR (due_at IS NOT NULL AND due_at <= ?) ${taskPeriodSql})`)
      .bind(stamp, ...taskValues)
  ]);
}

export async function dailyProgress(
  db: D1Database, householdId: string, memberIds: string[], timezone: string, now = new Date()
): Promise<DailyProgress[]> {
  const date = dateInTimezone(timezone, now);
  const rows = await db.prepare(`SELECT tp.member_id AS memberId, tp.status AS contributionState,
    t.status AS taskState, t.due_period AS duePeriod, t.due_at AS dueAt
    FROM household_task_participants tp
    JOIN household_task_instances t ON t.household_id = tp.household_id AND t.id = tp.task_id
    WHERE tp.household_id = ? AND t.occurrence_date = ? AND tp.participant_kind = 'required'`)
    .bind(householdId, date).all<{
      memberId: string; contributionState: string; taskState: string; duePeriod: string; dueAt: string | null
    }>();
  return memberIds.map((memberId) => {
    const assignments = rows.results.filter((row) => row.memberId === memberId);
    const complete = assignments.filter((row) => row.contributionState === "complete").length;
    const overdue = assignments.filter((row) => row.contributionState !== "complete" &&
      (row.contributionState === "missed" || row.taskState === "missed" ||
        (row.dueAt ? row.dueAt <= now.toISOString() : periodIsDue(row.duePeriod, timezone, now)))).length;
    const percentage = assignments.length ? Math.round(((assignments.length - overdue) / assignments.length) * 100) : 100;
    const allDone = assignments.length > 0 && complete === assignments.length;
    const state = percentage >= 76
      ? { status: allDone ? "All done" : assignments.length ? "On track" : "Ready", expression: "on_track" }
      : percentage >= 51 ? { status: "Doing well", expression: "calm" }
        : percentage >= 26 ? { status: "Needs a hand", expression: "behind" }
          : { status: "Needs support", expression: "needs_help" };
    return { memberId, percentage, ...state, assigned: assignments.length, complete, overdue,
      hasWork: assignments.length > 0 };
  });
}

export async function countIncompleteTasks(
  db: D1Database, householdId: string, date: string
): Promise<number> {
  const result = await db.prepare(`SELECT COUNT(*) AS value FROM household_task_instances
    WHERE household_id = ? AND occurrence_date = ? AND status != 'complete'`)
    .bind(householdId, date).first<{ value: number }>();
  return result?.value || 0;
}

export function canAdministerTasks(identity: Identity): boolean {
  return identityAccessLevel(identity) === "household_admin";
}
