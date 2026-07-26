import { describe, expect, it } from "vitest";
import { SESSION_COOKIE, type Identity } from "../../functions/api/auth";
import { onRequestGet as listEvents, onRequestPost as createEvent } from "../../functions/api/household/events/index";
import { onRequestDelete as cancelEvent } from "../../functions/api/household/events/[eventId]";
import { HOUSEHOLD_EVENT_TYPES, EVENT_RECURRENCES, weeklyReviewDefaults } from "../../shared/coordination";

const owner: Identity = {
  sessionId: "session", accountId: "account", householdId: "house-a", householdName: "Allen Family",
  householdReference: "allen", memberId: "owner", displayName: "Gareth", profileReference: "gareth",
  role: "owner", expiresAt: "2999", setupStatus: "complete", setupStep: "complete"
};
const activeMembers = [
  { id: "owner", displayName: "Gareth", role: "owner", accessLevel: "household_admin", ageBand: "adult", ageGroup: "adult" },
  { id: "parent", displayName: "Gillian", role: "parent_admin", accessLevel: "household_admin", ageBand: "adult", ageGroup: "adult" },
  { id: "teen", displayName: "Tyrel", role: "child", accessLevel: "managed_member", ageBand: "teen", ageGroup: "teen" },
  { id: "child", displayName: "Taryn", role: "child", accessLevel: "managed_member", ageBand: "child", ageGroup: "child" }
];
const storedEvent = {
  id: "event", title: "Family Meeting", eventType: "family_meeting", description: null, location: null,
  startsAt: "2026-08-02T18:00:00.000Z", endsAt: null, timezone: "Europe/London",
  recurrence: "weekly", customRecurrence: null, reminderMinutes: 30, visibility: "household",
  status: "active", createdByMemberId: "owner", createdByName: "Gareth", createdAt: "now"
};

function mockDb(options: {
  identity?: Identity | null; members?: typeof activeMembers; existing?: object | null;
  events?: object[]; event?: object | null;
} = {}) {
  const calls: Array<{ sql: string; values: unknown[] }> = []; const batches: Array<Array<{ sql: string; values: unknown[] }>> = [];
  const identity = options.identity === undefined ? owner : options.identity;
  const db = {
    prepare(sql: string) {
      const call = { sql, values: [] as unknown[] }; calls.push(call);
      const statement = {
        sql,
        values: call.values,
        bind(...values: unknown[]) {
          call.values = values;
          statement.values = values;
          return statement;
        },
        first: async () => {
          if (sql.includes("FROM sessions")) return identity;
          if (sql.includes("e.client_key")) return options.existing ?? null;
          if (sql.includes("WHERE e.household_id = ? AND e.id = ?")) return options.event ?? storedEvent;
          return null;
        },
        all: async () => {
          if (sql.includes("FROM members WHERE")) return { results: options.members ?? activeMembers };
          if (sql.includes("FROM household_event_members")) return { results: [] };
          if (sql.includes("FROM household_events e")) return { results: options.events ?? [] };
          return { results: [] };
        },
        run: async () => ({ success: true, meta: { changes: 1 } })
      };
      return statement;
    },
    async batch(statements: Array<{ sql: string; values: unknown[] }>) {
      batches.push(statements);
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    }
  } as unknown as D1Database;
  return { db, calls, batches };
}

function request(path: string, method = "GET", body?: object) {
  return new Request(`https://cradle.test${path}`, {
    method, headers: { cookie: `${SESSION_COOKIE}=token`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}
const eventBody = (patch: Record<string, unknown> = {}) => ({
  title: "Family Meeting", eventType: "family_meeting", startsAt: "2026-08-02T18:00:00.000Z",
  endsAt: null, timezone: "Europe/London", recurrence: "weekly", customRecurrence: null,
  reminderMinutes: 30, memberIds: ["owner", "parent", "teen", "child"], clientKey: "calendar-client",
  ...patch
});

describe("household coordination API", () => {
  it("shares one typed source for event, recurrence and Weekly Review defaults", () => {
    expect(HOUSEHOLD_EVENT_TYPES.map(({ value }) => value)).toEqual(expect.arrayContaining([
      "family_meeting", "leadership_meeting", "appointment", "school_event", "trip",
      "birthday", "household_reminder", "event", "weekly_review"
    ]));
    expect(EVENT_RECURRENCES.map(({ value }) => value)).toEqual([
      "one_off", "daily", "weekly", "fortnightly", "monthly", "yearly", "custom"
    ]);
    expect(weeklyReviewDefaults).toMatchObject({ weekday: 0, hour: 19, minute: 0, recurrence: "weekly" });
  });

  it("creates a Family Meeting for adults, teenagers and children in one tenant-scoped batch", async () => {
    const { db, batches } = mockDb();
    const response = await createEvent({ request: request("/api/household/events", "POST",
      eventBody({ householdId: "forged" })), env: { DB: db } });
    expect(response.status).toBe(201);
    expect(batches).toHaveLength(1);
    expect(batches[0][0].sql).toContain("INSERT INTO household_events");
    expect(batches[0][0].values).toContain("house-a");
    expect(batches[0][0].values).not.toContain("forged");
    const linked = batches[0].filter(({ sql }) => sql.includes("INSERT INTO household_event_members"))
      .flatMap(({ values }) => values);
    expect(linked).toEqual(expect.arrayContaining(["owner", "parent", "teen", "child"]));
  });

  it("restricts Leadership Meetings to Owner and Parent/Admin visibility", async () => {
    const adultDb = mockDb({ identity: { ...owner, role: "adult", memberId: "adult" } });
    expect((await createEvent({ request: request("/api/household/events", "POST",
      eventBody({ eventType: "leadership_meeting", memberIds: ["owner", "parent"] })),
      env: { DB: adultDb.db } })).status).toBe(403);

    const leadership = mockDb();
    const response = await createEvent({ request: request("/api/household/events", "POST",
      eventBody({ eventType: "leadership_meeting", title: "Leadership Meeting", memberIds: ["owner", "parent"] })),
      env: { DB: leadership.db } });
    expect(response.status).toBe(201);
    expect(leadership.batches[0][0].values).toContain("leadership");
  });

  it("links Appointments to a household Member and rejects a foreign Member", async () => {
    const valid = mockDb();
    expect((await createEvent({ request: request("/api/household/events", "POST",
      eventBody({ eventType: "appointment", title: "Dentist", recurrence: "one_off", memberIds: ["child"] })),
      env: { DB: valid.db } })).status).toBe(201);
    expect(valid.batches[0].find(({ sql }) => sql.includes("household_event_members"))?.values).toContain("subject");

    const invalid = mockDb();
    expect((await createEvent({ request: request("/api/household/events", "POST",
      eventBody({ eventType: "appointment", title: "Dentist", memberIds: ["foreign"] })),
      env: { DB: invalid.db } })).status).toBe(400);
  });

  it.each([
    ["trip", "Summer Trip"],
    ["household_reminder", "Book the boiler service"],
    ["birthday", "Taryn’s birthday"]
  ])("creates %s coordination events without creating tasks", async (eventType, title) => {
    const { db, calls } = mockDb();
    const response = await createEvent({ request: request("/api/household/events", "POST",
      eventBody({ eventType, title, recurrence: eventType === "birthday" ? "yearly" : "one_off", memberIds: [] })),
      env: { DB: db } });
    expect(response.status).toBe(201);
    expect(calls.some(({ sql }) => /INSERT INTO .*task/i.test(sql))).toBe(false);
  });

  it("makes event creation retry-safe for the same authenticated creator", async () => {
    const { db, batches } = mockDb({ existing: storedEvent });
    const response = await createEvent({ request: request("/api/household/events", "POST", eventBody()), env: { DB: db } });
    const body = await response.json() as { data: { created: boolean; event: { id: string } } };
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ created: false, event: { id: "event" } });
    expect(batches).toHaveLength(0);
  });

  it("hides leadership events from ordinary Members and denies Child creation", async () => {
    const adult = mockDb({ identity: { ...owner, role: "adult", memberId: "adult" } });
    expect((await listEvents({ request: request("/api/household/events"), env: { DB: adult.db } })).status).toBe(200);
    expect(adult.calls.find(({ sql }) => sql.includes("FROM household_events e"))?.sql)
      .toContain("e.visibility = 'household'");

    const child = mockDb({ identity: { ...owner, role: "child", memberId: "child" } });
    expect((await createEvent({ request: request("/api/household/events", "POST", eventBody()),
      env: { DB: child.db } })).status).toBe(403);
  });

  it("cancels only events resolved inside the authenticated household", async () => {
    const { db, calls } = mockDb({ event: storedEvent });
    const response = await cancelEvent({ request: request("/api/household/events/event", "DELETE", {}),
      env: { DB: db }, params: { eventId: "event" } });
    expect(response.status).toBe(200);
    const update = calls.find(({ sql }) => sql.includes("UPDATE household_events SET status = 'cancelled'"));
    expect(update?.values).toEqual(expect.arrayContaining(["house-a", "event"]));
  });
});
