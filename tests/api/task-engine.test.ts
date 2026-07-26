import { describe, expect, it } from "vitest";
import {
  dailyProgress,
  generateTodayTasks,
  personalTasks,
  refreshDailyTaskStates
} from "../../functions/api/tasks";

type Bound = {
  sql: string;
  values: unknown[];
  bind: (...values: unknown[]) => Bound;
  all: () => Promise<{ results: Record<string, unknown>[] }>;
  first: () => Promise<Record<string, unknown> | null>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function queryDatabase(results: (sql: string) => Record<string, unknown>[]) {
  const calls: Bound[] = [];
  const batches: Bound[][] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        sql,
        values: [],
        bind(...values: unknown[]) {
          statement.values = values;
          return statement;
        },
        async all() {
          return { results: results(sql) };
        },
        async first() {
          return results(sql)[0] || null;
        },
        async run() {
          return { success: true, meta: { changes: 1 } };
        }
      } as Bound;
      calls.push(statement);
      return statement;
    },
    async batch(statements: Bound[]) {
      batches.push(statements);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    }
  } as unknown as D1Database;
  return { db, calls, batches };
}

const now = new Date("2026-07-24T10:00:00.000Z");

describe("daily task generation", () => {
  it("rolls overdue work into recoverable missed history at the daily boundary", async () => {
    const { db, batches } = queryDatabase(() => []);
    await refreshDailyTaskStates(db, "house", "UTC", new Date("2026-07-24T23:15:00.000Z"));
    expect(batches).toHaveLength(1);
    expect(batches[0][0].sql).toContain("UPDATE household_task_participants");
    expect(batches[0][1].sql).toContain("UPDATE household_task_instances");
    for (const statement of batches[0]) {
      expect(statement.values).toContain("house");
      expect(statement.values).toContain("2026-07-24");
      expect(statement.values).toEqual(expect.arrayContaining(["morning", "afternoon", "evening", "anytime"]));
    }
  });

  it("materialises Rotation and Shared-team occurrences and advances only the Rotation carousel", async () => {
    const { db, batches } = queryDatabase((sql) => {
      if (sql.includes("FROM household_systems s")) {
        return [
          {
            id: "rotation", name: "Morning kitchen tidy", roomId: "kitchen", petId: null,
            frequency: "daily", createdAt: now.toISOString(), assignmentMode: "rotation",
            assignedMemberId: null, rotationNextIndex: 1
          },
          {
            id: "shared", name: "Children's room reset", roomId: "children-room", petId: null,
            frequency: "daily", createdAt: now.toISOString(), assignmentMode: "shared_team",
            assignedMemberId: null, rotationNextIndex: 0
          }
        ];
      }
      if (sql.includes("FROM routine_assignment_participants")) {
        return [
          { systemId: "rotation", memberId: "adult-a", participantOrder: 0 },
          { systemId: "rotation", memberId: "adult-b", participantOrder: 1 },
          { systemId: "rotation", memberId: "teen", participantOrder: 2 },
          { systemId: "shared", memberId: "teen", participantOrder: 0 },
          { systemId: "shared", memberId: "child", participantOrder: 1 }
        ];
      }
      return [];
    });

    expect(await generateTodayTasks(db, "house", "UTC", now)).toBe(2);
    const statements = batches.flat();
    const taskInserts = statements.filter(({ sql }) => sql.includes("INSERT INTO household_task_instances"));
    const participantInserts = statements.filter(({ sql }) => sql.includes("INSERT INTO household_task_participants"));
    const rotationTask = taskInserts.find(({ values }) => values[2] === "rotation");
    const sharedTask = taskInserts.find(({ values }) => values[2] === "shared");

    expect(rotationTask?.values[8]).toBe("adult-b");
    expect(rotationTask?.values[9]).toBe(1);
    expect(sharedTask?.values[8]).toBeNull();
    expect(participantInserts.filter(({ values }) => values[1] === rotationTask?.values[0])
      .map(({ values }) => values[2])).toEqual(["adult-b"]);
    expect(participantInserts.filter(({ values }) => values[1] === sharedTask?.values[0])
      .map(({ values }) => values[2])).toEqual(["teen", "child"]);

    const advance = statements.find(({ sql }) => sql.includes("UPDATE routine_assignments SET rotation_next_index"));
    expect(advance?.values.slice(0, 2)).toEqual([2, "adult-b"]);
    expect(statements.filter(({ sql }) => sql.includes("UPDATE routine_assignments"))).toHaveLength(1);
  });

  it("is idempotent and does not reset Rotation state on a retry", async () => {
    const { db, batches } = queryDatabase((sql) => {
      if (sql.includes("FROM household_systems s")) {
        return [{
          id: "rotation", name: "Kitchen reset", roomId: "kitchen", petId: null,
          frequency: "daily", createdAt: now.toISOString(), assignmentMode: "rotation",
          assignedMemberId: null, rotationNextIndex: 2
        }];
      }
      if (sql.includes("FROM routine_assignment_participants")) {
        return [
          { systemId: "rotation", memberId: "a", participantOrder: 0 },
          { systemId: "rotation", memberId: "b", participantOrder: 1 },
          { systemId: "rotation", memberId: "c", participantOrder: 2 }
        ];
      }
      if (sql.includes("FROM household_task_instances")) return [{ systemId: "rotation" }];
      return [];
    });

    expect(await generateTodayTasks(db, "house", "UTC", now)).toBe(0);
    expect(batches).toHaveLength(0);
  });
});

describe("today's canonical task views", () => {
  it("returns Shared-team work from participant records with independent contribution progress", async () => {
    const { db, calls } = queryDatabase((sql) => sql.includes("FROM household_task_instances t")
      ? [{
        id: "task", title: "Children's room reset", roomName: "Children's room", petName: null,
        duePeriod: "evening", dueAt: null, assignmentMode: "shared_team",
        state: "waiting_for_team", contributionState: "complete", participantKind: "required",
        teamCompleted: 1, teamTotal: 2, helpRequested: 0
      }] : []);

    const tasks = await personalTasks(db, "house", "teen", "2026-07-24");
    expect(tasks).toEqual([expect.objectContaining({
      id: "task",
      assignmentMode: "shared_team",
      contributionState: "complete",
      state: "waiting_for_team",
      teamCompleted: 1,
      teamTotal: 2
    })]);
    expect(calls.find(({ sql }) => sql.includes("FROM household_task_instances t"))?.sql)
      .toContain("tp.member_id = ?");
  });

  it("starts at 100%, does not penalise future work, and recovers after late completion", async () => {
    let completedLate = false;
    const { db } = queryDatabase((sql) => {
      if (!sql.includes("FROM household_task_participants tp")) return [];
      return [
        {
          memberId: "on-track", contributionState: "todo", taskState: "todo",
          duePeriod: "evening", dueAt: null
        },
        {
          memberId: "recovering", contributionState: completedLate ? "complete" : "missed",
          taskState: completedLate ? "complete" : "missed", duePeriod: "morning", dueAt: null
        },
        {
          memberId: "shared-complete", contributionState: "complete", taskState: "waiting_for_team",
          duePeriod: "morning", dueAt: null
        }
      ];
    });

    const initial = await dailyProgress(
      db, "house", ["on-track", "recovering", "shared-complete", "ready"], "UTC", now
    );
    expect(initial.find(({ memberId }) => memberId === "on-track"))
      .toEqual(expect.objectContaining({ percentage: 100, status: "On track" }));
    expect(initial.find(({ memberId }) => memberId === "recovering"))
      .toEqual(expect.objectContaining({ percentage: 0, status: "Needs support" }));
    expect(initial.find(({ memberId }) => memberId === "shared-complete"))
      .toEqual(expect.objectContaining({ percentage: 100, status: "All done" }));
    expect(initial.find(({ memberId }) => memberId === "ready"))
      .toEqual(expect.objectContaining({ percentage: 100, status: "Ready", hasWork: false }));

    completedLate = true;
    const recovered = await dailyProgress(db, "house", ["recovering"], "UTC", now);
    expect(recovered[0]).toEqual(expect.objectContaining({
      percentage: 100, status: "All done", complete: 1, overdue: 0
    }));
  });

  it("uses every supportive threshold without ranking or shaming language", async () => {
    const rows = (memberId: string, missed: number, total: number) =>
      Array.from({ length: total }, (_, index) => ({
        memberId,
        contributionState: index < missed ? "missed" : "todo",
        taskState: index < missed ? "missed" : "todo",
        duePeriod: "evening",
        dueAt: null
      }));
    const { db } = queryDatabase((sql) => sql.includes("FROM household_task_participants tp")
      ? [
        ...rows("green", 0, 4),
        ...rows("yellow", 1, 4),
        ...rows("amber", 2, 4),
        ...rows("coral", 3, 4)
      ] : []);
    const progress = await dailyProgress(db, "house", ["green", "yellow", "amber", "coral"], "UTC", now);
    expect(progress.map(({ percentage, status }) => [percentage, status])).toEqual([
      [100, "On track"],
      [75, "Doing well"],
      [50, "Needs a hand"],
      [25, "Needs support"]
    ]);
  });
});
