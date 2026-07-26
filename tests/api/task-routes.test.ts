import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, type Identity } from "../../functions/api/auth";
import { onRequestPost as completeTask } from "../../functions/api/household/tasks/[taskId]/complete";
import { onRequestPost as requestHelp } from "../../functions/api/household/tasks/[taskId]/help";

const member: Identity = {
  sessionId: "session", householdId: "house-a", householdName: "Home", householdReference: "home",
  memberId: "teen", displayName: "Tyrel", profileReference: "tyrel", role: "child",
  accessLevel: "managed_member", ageBand: "teen",
  expiresAt: "2999", setupStatus: "complete", setupStep: "complete"
};
const admin: Identity = {
  ...member,
  memberId: "owner",
  displayName: "Alex",
  role: "owner",
  accessLevel: "household_admin",
  ageBand: "adult"
};

type Bound = {
  sql: string;
  values: unknown[];
  bind: (...values: unknown[]) => Bound;
  first: () => Promise<Record<string, unknown> | null>;
  all: () => Promise<{ results: Record<string, unknown>[] }>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function database(options: {
  identity?: Identity;
  task?: Record<string, unknown> | null;
  participant?: Record<string, unknown> | null;
  helper?: Record<string, unknown> | null;
  existingParticipant?: Record<string, unknown> | null;
  help?: Record<string, unknown> | null;
  required?: Array<{ memberId: string; status: string }>;
}) {
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
        async first() {
          if (sql.includes("FROM sessions")) return options.identity || member;
          if (sql.includes("FROM household_task_instances WHERE")) return options.task ?? null;
          if (sql.includes("FROM household_task_instances t JOIN household_task_participants")) {
            return options.task ?? null;
          }
          if (sql.includes("FROM household_task_participants") && !sql.includes("JOIN") &&
            sql.includes("member_id = ?")) {
            return options.participant ?? options.existingParticipant ?? null;
          }
          if (sql.includes("FROM members WHERE")) return options.helper ?? null;
          if (sql.includes("FROM task_help_requests")) return options.help ?? null;
          return null;
        },
        async all() {
          if (sql.includes("participant_kind = 'required'")) {
            return { results: options.required || [] };
          }
          return { results: [] };
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

function request(path: string, body: object) {
  return new Request(`https://cradle.test${path}`, {
    method: "POST",
    headers: { cookie: `${SESSION_COOKIE}=token`, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("task contribution and help routes", () => {
  it("stores one Shared-team participant contribution and waits for the rest of the team", async () => {
    const { db, batches } = database({
      task: { id: "shared", status: "todo", assignmentMode: "shared_team" },
      participant: { participantKind: "required", status: "todo" },
      required: [{ memberId: "teen", status: "complete" }, { memberId: "child", status: "todo" }]
    });
    const response = await completeTask({
      request: request("/api/household/tasks/shared/complete", {}),
      env: { DB: db },
      params: { taskId: "shared" }
    });
    const body = await response.json() as { data: { completed: boolean; state: string; celebrationMemberIds: string[] } };
    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      completed: false,
      state: "waiting_for_team",
      celebrationMemberIds: ["teen"]
    });
    expect(batches[0][0].sql).toContain("member_id = ?");
    expect(batches[1][0].values[0]).toBe("waiting_for_team");
  });

  it("lets an assignee ask another active Family member for help without changing a required teammate", async () => {
    const available = database({
      task: { id: "task", status: "todo", participantStatus: "todo" },
      helper: { id: "adult" },
      existingParticipant: null
    });
    const response = await requestHelp({
      request: request("/api/household/tasks/task/help", { helperMemberId: "adult" }),
      env: { DB: available.db },
      params: { taskId: "task" }
    });
    expect(response.status).toBe(201);
    expect(available.batches[0].some(({ sql, values }) =>
      sql.includes("INSERT INTO task_help_requests") && values.includes("adult"))).toBe(true);
    expect(available.batches[0].some(({ sql }) =>
      sql.includes("INSERT INTO household_task_participants") && sql.includes("'helper'"))).toBe(true);

    const alreadyRequired = database({
      task: { id: "task", status: "todo", participantStatus: "todo" },
      helper: { id: "child" },
      existingParticipant: { participantKind: "required" },
      participant: { participantKind: "required" }
    });
    const conflict = await requestHelp({
      request: request("/api/household/tasks/task/help", { helperMemberId: "child" }),
      env: { DB: alreadyRequired.db },
      params: { taskId: "task" }
    });
    expect(conflict.status).toBe(409);
    expect(alreadyRequired.batches).toHaveLength(0);
  });

  it("allows a helper to sign off the requested contribution and complete the mission", async () => {
    const helperIdentity = {
      ...member,
      memberId: "adult",
      displayName: "Sam",
      role: "adult" as const,
      accessLevel: "household_member" as const,
      ageBand: "adult" as const
    };
    const { db, batches } = database({
      identity: helperIdentity,
      task: { id: "task", status: "in_progress", assignmentMode: "one_person" },
      participant: { participantKind: "helper", status: "todo" },
      help: { requestedByMemberId: "teen" },
      required: [{ memberId: "teen", status: "complete" }]
    });
    const response = await completeTask({
      request: request("/api/household/tasks/task/complete", {}),
      env: { DB: db },
      params: { taskId: "task" }
    });
    const body = await response.json() as { data: { completed: boolean; celebrationMemberIds: string[] } };
    expect(body.data).toEqual({ completed: true, state: "complete", celebrationMemberIds: ["teen"] });
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][1].values).toContain("teen");
    expect(batches[1].some(({ sql }) => sql.includes("UPDATE task_help_requests SET status = 'completed'"))).toBe(true);
  });

  it("lets a Household admin act for one Managed-member contribution without overriding the team", async () => {
    const { db, batches } = database({
      identity: admin,
      helper: { id: "child" },
      task: { id: "shared", status: "todo", assignmentMode: "shared_team" },
      participant: { participantKind: "required", status: "todo" },
      required: [{ memberId: "child", status: "complete" }, { memberId: "teen", status: "todo" }]
    });
    const response = await completeTask({
      request: request("/api/household/tasks/shared/complete", { contributionMemberId: "child" }),
      env: { DB: db },
      params: { taskId: "shared" }
    });
    const body = await response.json() as { data: { state: string; celebrationMemberIds: string[] } };
    expect(response.status).toBe(200);
    expect(body.data).toEqual({ completed: false, state: "waiting_for_team", celebrationMemberIds: ["child"] });
    expect(batches[0][0].sql).toContain("member_id = ?");
    expect(batches[0][0].sql).not.toContain("participant_kind = 'required'");
    expect(batches[0][0].values).toContain("child");
  });

  it("lets a Household admin request help for a Managed member’s assigned mission", async () => {
    const { db, batches } = database({
      identity: admin,
      helper: { id: "child" },
      task: { id: "task", status: "todo", participantStatus: "todo" },
      existingParticipant: null
    });
    const response = await requestHelp({
      request: request("/api/household/tasks/task/help", {
        requestedByMemberId: "child",
        helperMemberId: "adult"
      }),
      env: { DB: db },
      params: { taskId: "task" }
    });
    expect(response.status).toBe(201);
    const insert = batches[0].find(({ sql }) => sql.includes("INSERT INTO task_help_requests"));
    expect(insert?.values).toEqual(expect.arrayContaining(["child", "adult"]));
  });

  it("rejects a task identifier that is not in the authenticated household", async () => {
    const { db, batches } = database({ task: null });
    const response = await completeTask({
      request: request("/api/household/tasks/foreign/complete", {}),
      env: { DB: db },
      params: { taskId: "foreign" }
    });
    expect(response.status).toBe(404);
    expect(batches).toHaveLength(0);
  });
});
