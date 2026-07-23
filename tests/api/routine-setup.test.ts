import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, type Identity } from "../../functions/api/auth";
import { onRequestGet as dashboardRoute } from "../../functions/api/dashboard";
import { onRequestPost as applyRoutines } from "../../functions/api/household/routine-setup/apply";
import { onRequestGet as listRoutines } from "../../functions/api/household/systems/index";

const identity: Identity = {
  sessionId: "session", householdId: "house-a", householdName: "Fox House", householdReference: "fox",
  memberId: "owner", displayName: "Alex", profileReference: "alex", role: "owner", expiresAt: "2999-01-01",
  setupStatus: "complete", setupStep: "complete"
};
const room = { id: "kitchen", name: "Kitchen", roomType: "kitchen" };
const pet = { id: "tori", name: "Tori", petType: "cat" };
const members = [
  { id: "owner", displayName: "Alex", role: "owner" },
  { id: "adult", displayName: "Sam", role: "adult" }
];
type Existing = { id: string; sourceTemplateKey: string | null; clientKey: string | null;
  roomId: string | null; petId: string | null; status: string; name: string };

function mockDb(options: {
  current?: Identity | null; rooms?: object[]; pets?: object[]; members?: object[]; existing?: Existing[];
  batchFails?: boolean;
} = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = []; const batches: unknown[][] = [];
  const current = options.current === undefined ? identity : options.current;
  const db = { prepare(sql: string) {
    const call = { sql, values: [] as unknown[] }; calls.push(call);
    return { bind(...values: unknown[]) {
      call.values = values;
      return {
        first: async () => {
          if (sql.includes("FROM sessions")) return current;
          if (sql.includes("MAX(display_order)")) return { value: 0 };
          if (sql.includes("FROM companions")) return null;
          return null;
        },
        all: async () => {
          if (sql.includes("FROM rooms")) return { results: options.rooms ?? [room] };
          if (sql.includes("FROM pets")) return { results: options.pets ?? [pet] };
          if (sql.includes("FROM members")) return { results: options.members ?? members };
          if (sql.includes("FROM household_systems") && !sql.includes("JOIN members")) {
            return { results: options.existing ?? [] };
          }
          if (sql.includes("FROM household_systems s")) return { results: [] };
          if (sql.includes("FROM household_system_participants")) return { results: [] };
          return { results: [] };
        },
        run: async () => ({ success: true, meta: { changes: 1 } })
      };
    } };
  }, async batch(statements: unknown[]) {
    batches.push(statements);
    if (options.batchFails) throw new Error("aggregate failed");
    return statements.map(() => ({ success: true, meta: { changes: 1 } }));
  } } as unknown as D1Database;
  return { db, calls, batches };
}

function request(path: string, method = "GET", body?: object) {
  return new Request(`https://cradle.test${path}`, {
    method, headers: { cookie: `${SESSION_COOKIE}=token`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

const selection = {
  templateKey: "kitchen.evening_reset", clientKey: null, enabled: true, roomId: "kitchen", petId: null,
  frequency: "daily", ownerMemberId: "owner", rotationEnabled: false, rotationMemberIds: [],
  customisedName: "", note: ""
};

describe("Dashboard and guided routine setup API", () => {
  it("denies unauthenticated Dashboard access", async () => {
    const { db } = mockDb({ current: null });
    expect((await dashboardRoute({ request: request("/api/dashboard"), env: { DB: db } })).status).toBe(401);
  });

  it("returns one server-authoritative Dashboard aggregate with deterministic Room and Pet recommendations", async () => {
    const { db, calls } = mockDb();
    const response = await dashboardRoute({ request: request("/api/dashboard"), env: { DB: db } });
    const body = await response.json() as { data: {
      household: { name: string }; currentUser: { displayName: string };
      recommendations: Array<{ templateKey: string }>; activeRoutineCount: number; todayMission: { state: string };
    }; requestId: string };
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-ID")).toBe(body.requestId);
    expect(body.data.household.name).toBe("Fox House");
    expect(body.data.currentUser.displayName).toBe("Alex");
    expect(body.data.recommendations.map(({ templateKey }) => templateKey)).toEqual(expect.arrayContaining([
      "kitchen.evening_reset", "kitchen.weekly_clean", "pet.cat.morning_feed", "pet.cat.refresh_water"
    ]));
    expect(body.data).toMatchObject({ activeRoutineCount: 0, todayMission: { state: "setup" } });
    expect(JSON.stringify(body.data)).not.toMatch(/completed tasks|on track|behind|progress percentage/i);
    expect(calls.filter(({ sql }) => sql.includes("FROM rooms") || sql.includes("FROM pets"))
      .every(({ sql }) => sql.includes("is_active = 1"))).toBe(true);
  });

  it("keeps duplicate typed Rooms distinct and gives Children no setup recommendations", async () => {
    const duplicateRooms = [
      { id: "bedroom-one", name: "Main bedroom", roomType: "bedroom" },
      { id: "bedroom-two", name: "Guest bedroom", roomType: "bedroom" }
    ];
    const manager = mockDb({ rooms: duplicateRooms, pets: [] });
    const managerResponse = await dashboardRoute({
      request: request("/api/dashboard"), env: { DB: manager.db }
    });
    const managerBody = await managerResponse.json() as { data: {
      recommendations: Array<{ selectionKey: string; templateKey: string }>
    } };
    const bedroomRecommendations = managerBody.data.recommendations
      .filter(({ templateKey }) => templateKey === "bedroom.weekly_clean");
    expect(bedroomRecommendations.map(({ selectionKey }) => selectionKey).sort()).toEqual([
      "bedroom.weekly_clean:room:bedroom-one", "bedroom.weekly_clean:room:bedroom-two"
    ]);

    const child = mockDb({ current: { ...identity, role: "child" } });
    const childResponse = await dashboardRoute({
      request: request("/api/dashboard"), env: { DB: child.db }
    });
    const childBody = await childResponse.json() as { data: {
      recommendations: unknown[]; routines: unknown[];
      setup: { canManage: boolean }; todayMission: { state: string }
    } };
    expect(childBody.data).toMatchObject({
      recommendations: [], routines: [], setup: { canManage: false }, todayMission: { state: "waiting" }
    });
  });

  it("hydrates canonical templates server-side and applies the aggregate in one batch", async () => {
    const { db, calls, batches } = mockDb();
    const response = await applyRoutines({ request: request("/api/household/routine-setup/apply", "POST", {
      householdId: "forged", selections: [{ ...selection, steps: ["Client-controlled step"] }]
    }), env: { DB: db } });
    expect(response.status).toBe(200);
    expect(batches).toHaveLength(1);
    const root = calls.find(({ sql }) => sql.includes("INSERT INTO household_systems"));
    expect(root?.values).toContain("house-a");
    expect(root?.values).toContain("kitchen.evening_reset");
    expect(root?.values).not.toContain("forged");
    const stepValues = calls.filter(({ sql }) => sql.includes("INSERT INTO household_system_steps")).flatMap(({ values }) => values);
    expect(stepValues).toContain("Wash or load dishes");
    expect(stepValues).not.toContain("Client-controlled step");
  });

  it("updates an existing template routine instead of creating a duplicate", async () => {
    const existing = [{ id: "existing", name: "Our evening reset", sourceTemplateKey: "kitchen.evening_reset", clientKey: null,
      roomId: "kitchen", petId: null, status: "active" }];
    const { db, calls, batches } = mockDb({ existing });
    const response = await applyRoutines({ request: request("/api/household/routine-setup/apply", "POST", {
      selections: [{ ...selection, frequency: "weekends" }]
    }), env: { DB: db } });
    expect(response.status).toBe(200);
    expect(batches).toHaveLength(1);
    expect(calls.some(({ sql }) => sql.includes("INSERT INTO household_systems"))).toBe(false);
    expect(calls.find(({ sql }) => sql.includes("UPDATE household_systems SET name"))?.values).toContain("weekends");
    expect(calls.find(({ sql }) => sql.includes("UPDATE household_systems SET name"))?.values[0]).toBe("Our evening reset");
  });

  it("creates and idempotently updates a custom Pet routine without assigning responsibility to the Pet", async () => {
    const customPet = {
      ...selection, templateKey: null, clientKey: "custom-groom-tori", roomId: null, petId: "tori",
      customisedName: "Brush Tori", frequency: "weekly"
    };
    const created = mockDb();
    const createResponse = await applyRoutines({
      request: request("/api/household/routine-setup/apply", "POST", { selections: [customPet] }),
      env: { DB: created.db }
    });
    expect(createResponse.status).toBe(200);
    const insert = created.calls.find(({ sql }) => sql.includes("INSERT INTO household_systems"));
    expect(insert?.values).toContain("tori");
    expect(insert?.values).toContain("custom-groom-tori");
    expect(insert?.values).toContain("owner");
    expect(insert?.values.filter((value) => value === "tori")).toHaveLength(1);

    const updated = mockDb({ existing: [{
      id: "custom-existing", name: "Brush Tori", sourceTemplateKey: null, clientKey: "custom-groom-tori",
      roomId: null, petId: "tori", status: "active"
    }] });
    const updateResponse = await applyRoutines({
      request: request("/api/household/routine-setup/apply", "POST", {
        selections: [{ ...customPet, frequency: "fortnightly" }]
      }),
      env: { DB: updated.db }
    });
    expect(updateResponse.status).toBe(200);
    expect(updated.calls.some(({ sql }) => sql.includes("INSERT INTO household_systems"))).toBe(false);
    expect(updated.calls.find(({ sql }) => sql.includes("UPDATE household_systems SET name"))?.values)
      .toContain("fortnightly");
  });

  it("skips disabled new recommendations without creating records", async () => {
    const { db, batches } = mockDb();
    const response = await applyRoutines({ request: request("/api/household/routine-setup/apply", "POST", {
      selections: [{ ...selection, enabled: false }]
    }), env: { DB: db } });
    expect(response.status).toBe(200);
    expect(batches).toHaveLength(0);
  });

  it("persists rotation intent only for eligible household Members", async () => {
    const { db, calls } = mockDb();
    const response = await applyRoutines({ request: request("/api/household/routine-setup/apply", "POST", {
      selections: [{ ...selection, rotationEnabled: true, rotationMemberIds: ["owner", "adult"] }]
    }), env: { DB: db } });
    expect(response.status).toBe(200);
    const participants = calls.filter(({ sql }) => sql.includes("INSERT INTO household_system_participants"));
    expect(participants).toHaveLength(2);
    expect(participants.flatMap(({ values }) => values)).not.toContain("tori");
  });

  it("rejects cross-household Room, Pet and Member references before a batch", async () => {
    const invalidReferences: Array<[Record<string, unknown>, Parameters<typeof mockDb>[0]]> = [
      [{ roomId: "foreign" }, { rooms: [] }],
      [{ templateKey: "pet.cat.refresh_water", roomId: null, petId: "foreign" }, { pets: [] }],
      [{ ownerMemberId: "foreign" }, { members }]
    ];
    for (const [patch, options] of invalidReferences) {
      const { db, batches } = mockDb(options);
      const response = await applyRoutines({ request: request("/api/household/routine-setup/apply", "POST", {
        selections: [{ ...selection, ...patch }]
      }), env: { DB: db } });
      expect(response.status).toBe(400);
      expect(batches).toHaveLength(0);
    }
  });

  it("denies Adult and Child setup mutations and gives Adults active-only library access", async () => {
    for (const role of ["adult", "child"] as const) {
      const denied = mockDb({ current: { ...identity, role } });
      const response = await applyRoutines({ request: request("/api/household/routine-setup/apply", "POST", {
        selections: [selection]
      }), env: { DB: denied.db } });
      expect(response.status).toBe(403);
      expect(denied.batches).toHaveLength(0);
    }
    const adult = mockDb({ current: { ...identity, role: "adult" } });
    const listed = await listRoutines({ request: request("/api/household/systems?status=archived"), env: { DB: adult.db } });
    expect(listed.status).toBe(200);
    const query = adult.calls.find(({ sql }) => sql.includes("FROM household_systems s"));
    expect(query?.values).toEqual(["house-a", "active"]);
  });

  it("returns a typed safe error and request ID when the transactional batch fails", async () => {
    const { db } = mockDb({ batchFails: true });
    const response = await applyRoutines({ request: request("/api/household/routine-setup/apply", "POST", {
      selections: [selection]
    }), env: { DB: db } });
    const body = await response.json() as { error: { code: string; message: string }; requestId: string };
    expect(response.status).toBe(500);
    expect(response.headers.get("X-Request-ID")).toBe(body.requestId);
    expect(body.error).toEqual({ code: "SERVER_ERROR", message: "Cradle could not complete the request." });
  });
});
