import { describe, expect, it } from "vitest";
import { generateRoutineDraft, syncRoutineRotationsToFamily } from "../../functions/api/routine-generation";
import { templatesForPet, templatesForRoom } from "../../shared/routines";

type Bound = {
  sql: string;
  values: unknown[];
  bind: (...values: unknown[]) => Bound;
  all: () => Promise<{ results: object[] }>;
  first: () => Promise<object | null>;
  run: () => Promise<{ success: boolean; meta: { changes: number } }>;
};

function database(options: {
  existing?: Array<{ sourceTemplateKey: string; roomId: string | null; petId: string | null }>;
  rotating?: Array<{ id: string }>;
  rooms?: Array<{ id: string; name: string; roomType: string }>;
  occupants?: Array<{ roomId: string; memberId: string }>;
} = {}) {
  const existing = [...(options.existing || [])];
  const members = [
    { id: "owner", role: "owner", accessLevel: "household_admin", ageBand: "adult", createdAt: "2026-07-24" },
    { id: "managed-child", role: "child", accessLevel: "managed_member", ageBand: "child", createdAt: "2026-07-24" },
    { id: "unclaimed-adult", role: "adult", accessLevel: "household_member", ageBand: "adult", createdAt: "2026-07-24" },
    { id: "invited-teen", role: "child", accessLevel: "managed_member", ageBand: "teen", createdAt: "2026-07-24" }
  ];
  const calls: Bound[] = [];
  const batches: Bound[][] = [];
  const db = {
    prepare(sql: string) {
      const statement = {
        sql, values: [],
        bind(...values: unknown[]) { statement.values = values; return statement; },
        async all() {
          if (sql.includes("FROM members")) return { results: members };
          if (sql.includes("FROM rooms")) return { results: options.rooms ||
            [{ id: "kitchen", name: "Kitchen", roomType: "kitchen" }] };
          if (sql.includes("FROM room_occupants")) return { results: options.occupants || [] };
          if (sql.includes("FROM pets")) return { results: [{ id: "miso", name: "Miso", petType: "cat" }] };
          if (sql.includes("source_template_key AS sourceTemplateKey")) return { results: existing };
          if (sql.includes("rotation_enabled = 1")) return { results: options.rotating || [] };
          return { results: [] };
        },
        async first() { return sql.includes("MAX(display_order)") ? { value: 0 } : null; },
        async run() { return { success: true, meta: { changes: 1 } }; }
      } as Bound;
      calls.push(statement);
      return statement;
    },
    async batch(statements: Bound[]) {
      batches.push(statements);
      for (const statement of statements.filter(({ sql }) => sql.includes("INSERT INTO household_systems"))) {
        existing.push({
          sourceTemplateKey: String(statement.values[12]),
          roomId: statement.values[4] as string | null,
          petId: statement.values[5] as string | null
        });
      }
      return statements.map(() => ({ success: true, meta: { changes: 1 } }));
    }
  } as unknown as D1Database;
  return { db, calls, batches, members, existing };
}

describe("automatic household routine draft", () => {
  it("creates a retry-safe Room and Pet first draft with every Family Status member in rotations", async () => {
    const { db, calls, batches, members } = database();
    const expected = templatesForRoom("kitchen").length + templatesForPet("cat").length;
    expect(await generateRoutineDraft(db, "house")).toBe(expected);
    const statements = batches.flat();
    const systemInserts = statements.filter(({ sql }) => sql.includes("INSERT INTO household_systems"));
    expect(systemInserts).toHaveLength(expected);
    expect(systemInserts.some(({ sql }) => sql.includes("'paused'"))).toBe(true);
    const participants = statements.filter(({ sql }) => sql.includes("INSERT INTO household_system_participants"));
    for (const member of members) expect(participants.some(({ values }) => values[2] === member.id)).toBe(true);
    expect(calls.find(({ sql }) => sql.includes("FROM members"))?.sql)
      .toContain("lifecycle_state NOT IN ('left', 'suspended')");

    const batchCount = batches.length;
    expect(await generateRoutineDraft(db, "house")).toBe(0);
    expect(batches.slice(batchCount).flat().some(({ sql }) => sql.includes("INSERT INTO household_systems"))).toBe(false);
  });

  it("does not recreate a family-removed generated routine", async () => {
    const { db, batches } = database({ existing: [{
      sourceTemplateKey: "kitchen.evening_reset", roomId: "kitchen", petId: null
    }] });
    await generateRoutineDraft(db, "house");
    const generatedKeys = batches.flat()
      .filter(({ sql }) => sql.includes("INSERT INTO household_systems"))
      .map(({ values }) => values[12]);
    expect(generatedKeys).not.toContain("kitchen.evening_reset");
  });

  it("never rewrites a saved Rotation participant subset", async () => {
    const { db, batches } = database({ rotating: [{ id: "routine" }] });
    await syncRoutineRotationsToFamily(db, "house");
    const statements = batches.flat();
    expect(statements.some(({ sql }) => sql.includes("DELETE FROM household_system_participants"))).toBe(false);
    expect(statements.some(({ sql }) => sql.includes("routine_assignment_participants"))).toBe(false);
  });

  it("uses bedroom occupants and creates a Shared team for a suitable children’s room reset", async () => {
    const { db, batches } = database({
      rooms: [
        { id: "parents", name: "Parents’ bedroom", roomType: "bedroom" },
        { id: "children", name: "Children’s bedroom", roomType: "child_bedroom" }
      ],
      occupants: [
        { roomId: "parents", memberId: "owner" },
        { roomId: "parents", memberId: "unclaimed-adult" },
        { roomId: "children", memberId: "invited-teen" },
        { roomId: "children", memberId: "managed-child" }
      ]
    });
    await generateRoutineDraft(db, "house");
    const batchFor = (key: string) => batches.find((batch) =>
      batch.some(({ sql, values }) => sql.includes("INSERT INTO household_systems") && values[12] === key)
    ) || [];
    const parentClean = batchFor("bedroom.weekly_clean");
    expect(parentClean.filter(({ sql }) => sql.includes("routine_assignment_participants"))
      .map(({ values }) => values[2])).toEqual(["owner", "unclaimed-adult"]);

    const childReset = batchFor("child_bedroom.weekly_reset");
    expect(childReset.find(({ sql }) => sql.includes("INSERT INTO routine_assignments"))?.values[2])
      .toBe("shared_team");
    expect(childReset.filter(({ sql }) => sql.includes("routine_assignment_participants"))
      .map(({ values }) => values[2])).toEqual(["invited-teen", "managed-child"]);
  });

  it("persists carousel-style starting positions across consecutive generated Rotations", async () => {
    const { db, batches } = database({
      rooms: [
        { id: "living-1", name: "Living room", roomType: "living_room" },
        { id: "living-2", name: "Family room", roomType: "living_room" },
        { id: "living-3", name: "Snug", roomType: "living_room" }
      ],
      occupants: []
    });
    await generateRoutineDraft(db, "house");
    const starts = batches.flatMap((batch) => {
      const root = batch.find(({ sql }) => sql.includes("INSERT INTO household_systems"));
      const assignment = batch.find(({ sql }) => sql.includes("INSERT INTO routine_assignments"));
      return root?.sql.includes("'active'") && assignment?.values[2] === "rotation"
        ? [assignment.values[4]] : [];
    });
    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(starts.slice(0, 3)).toEqual([0, 1, 2]);
  });
});
