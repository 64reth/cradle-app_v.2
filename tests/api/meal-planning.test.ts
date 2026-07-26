import { describe, expect, it } from "vitest";
import { confirmWeeklyPlan, createRotation, generateWeeklyMealPlan, mealDuplicateCandidates, occasionMembers, parseMealSlot, refreshShoppingList, regenerateWeeklyMealPlan, requireMealManagement, updateWeeklySlot } from "../../functions/api/meal-planning";

const owner = {
  sessionId: "session", householdId: "home", householdName: "Home", householdReference: "home",
  memberId: "owner", displayName: "Gareth", profileReference: "gareth", role: "owner" as const,
  accessLevel: "household_admin" as const, ageBand: "adult" as const, expiresAt: "2999-01-01",
  setupStatus: "complete" as const, setupStep: "complete" as const
};

function database(options: { rotation?: object | null; existing?: object | null; sourceSlots?: object[]; plan?: object | null; slot?: object | null; ingredients?: object[] } = {}) {
  const batches: Array<Array<{ sql: string; values: unknown[] }>> = [];
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const db = {
    prepare(sql: string) {
      const statement = { sql, values: [] as unknown[], bind(...values: unknown[]) { statement.values = values; return statement; },
        async first() {
          if (sql.includes("FROM meal_rotations") && sql.includes("cycle_length_weeks")) return options.rotation === undefined
            ? { id: "rotation", cycleLengthWeeks: 4, startsOn: "2026-08-03" } : options.rotation;
          if (sql.includes("FROM weekly_meal_plan_slots s")) return options.slot || {
            id: "plan-slot", sourceRotationSlotId: "rotation-slot", dayOfWeek: 5, mealType: "dinner", sourceRotationId: "rotation"
          };
          if (sql.includes("FROM meal_shopping_lists")) return { id: "shopping-list" };
          if (sql.includes("FROM weekly_meal_plans p") || sql.includes("FROM weekly_meal_plans WHERE")) return options.plan || { id: "plan", weekStart: "2026-08-03", rotationWeekNumber: 1 };
          if (sql.includes("FROM weekly_meal_plans") && sql.includes("week_start")) return options.existing || null;
          return null;
        },
        async all() {
          if (sql.includes("FROM meal_rotation_slots")) return { results: options.sourceSlots || [] };
          if (sql.includes("FROM weekly_meal_plan_slots s JOIN meal_ingredients")) return { results: options.ingredients || [] };
          if (sql.includes("FROM weekly_meal_plan_slots")) return { results: [] };
          return { results: [] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; }
      };
      calls.push(statement);
      return statement;
    },
    async batch(statements: Array<{ sql: string; values: unknown[] }>) { batches.push(statements); return statements.map(() => ({ success: true, meta: { changes: 1 } })); }
  } as unknown as D1Database;
  return { db, batches, calls };
}

describe("meal rotation API foundation", () => {
  it("accepts the supported slot kinds and preserves empty flexible nights", () => {
    expect(parseMealSlot({ rotationWeekNumber: 4, dayOfWeek: 5, mealType: "dinner", slotKind: "takeaway" }).slotKind).toBe("takeaway");
    expect(parseMealSlot({ rotationWeekNumber: 1, dayOfWeek: 7, mealType: "dinner", slotKind: "flexible" }).customMealName).toBeNull();
    expect(() => parseMealSlot({ rotationWeekNumber: 5, dayOfWeek: 1, mealType: "dinner" })).toThrow();
  });

  it("keeps rotation management with household leadership", () => {
    expect(() => requireMealManagement({ ...owner, role: "adult", accessLevel: "household_member" })).toThrow();
    expect(() => requireMealManagement(owner)).not.toThrow();
  });

  it("creates a retry-safe rotation with custom dinner names", async () => {
    const { db, batches } = database();
    const id = await createRotation(db, owner, { title: "  Family dinners ", slots: [
      { rotationWeekNumber: 1, dayOfWeek: 5, mealType: "dinner", customMealName: "Friday pizza" }
    ] });
    expect(id).toBeTypeOf("string");
    expect(batches.flat().some(({ sql, values }) => sql.includes("INSERT INTO meal_rotations") && values.includes("Family dinners"))).toBe(true);
    expect(batches.flat().some(({ sql, values }) => sql.includes("meal_rotation_slots") && values.includes("Friday pizza"))).toBe(true);
  });

  it("projects seven dinner slots and four weekend daytime slots without duplicating a generated week", async () => {
    const sourceSlots = Array.from({ length: 7 }, (_, index) => ({
      id: `rotation-${index}`, dayOfWeek: index + 1, mealType: "dinner", mealId: null,
      customMealName: `Dinner ${index + 1}`, slotKind: "meal", assignedCookMemberId: null,
      assignmentMode: "decide_later", notes: null, sortPosition: index
    }));
    const { db, batches } = database({ sourceSlots });
    await generateWeeklyMealPlan(db, owner, "2026-08-05");
    const inserts = batches.flat().filter(({ sql }) => sql.includes("weekly_meal_plan_slots"));
    expect(inserts).toHaveLength(11);
    expect(inserts.filter(({ values }) => values.includes("dinner")).length).toBe(7);
    expect(inserts.filter(({ values }) => values.includes("breakfast") || values.includes("lunch")).length).toBe(4);
  });

  it("keeps a dated override separate from the repeating rotation", async () => {
    const { db, batches } = database();
    await updateWeeklySlot(db, owner, "plan", "plan-slot", { customMealName: "This week only", editScope: "this_week" });
    expect(batches.flat().some(({ sql }) => sql.includes("UPDATE meal_rotation_slots"))).toBe(false);
    expect(batches.flat().some(({ sql }) => sql.includes("override_kind = ?"))).toBe(false);
  });

  it("keeps away nights visible without adding a meal or changing the rhythm", async () => {
    const { db, calls } = database();
    await updateWeeklySlot(db, owner, "plan", "plan-slot", { action: "eating_away", notes: "School event" });
    expect(calls.some(({ sql, values }) => sql.includes("UPDATE weekly_meal_plan_slots") && values.includes("eating_out") && values.includes("School event"))).toBe(true);
    expect(calls.some(({ sql }) => sql.includes("UPDATE meal_rotation_slots"))).toBe(false);
  });

  it("confirms a reviewed week without removing its editability", async () => {
    const { db, calls } = database();
    await confirmWeeklyPlan(db, owner, "plan");
    expect(calls.some(({ sql }) => sql.includes("UPDATE weekly_meal_plans") && sql.includes("status = 'active'"))).toBe(true);
  });

  it("regenerates only unconfirmed weekly slots", async () => {
    const { db, calls } = database();
    await regenerateWeeklyMealPlan(db, owner, "2026-08-05");
    expect(calls.some(({ sql }) => sql.includes("DELETE FROM weekly_meal_plan_slots") && sql.includes("override_kind = 'none'") )).toBe(true);
  });

  it("requires an explicit source before changing the repeating rotation", async () => {
    const { db } = database({ slot: { id: "plan-slot", sourceRotationSlotId: null, dayOfWeek: 5, mealType: "dinner", sourceRotationId: null } });
    await expect(updateWeeklySlot(db, owner, "plan", "plan-slot", {
      customMealName: "New rhythm", editScope: "repeating_rotation"
    })).rejects.toMatchObject({ status: 409 });
  });

  it("derives shopping ingredients from the dated plan query", async () => {
    const { db, batches, calls } = database({ ingredients: [{ ingredientName: "Tomatoes", quantity: "4" }] });
    await refreshShoppingList(db, "home", "plan");
    expect(calls.some(({ sql }) => sql.includes("weekly_meal_plan_slots") && sql.includes("meal_ingredients"))).toBe(true);
    expect(batches.flat().some(({ sql, values }) => sql.includes("meal_shopping_list_items") && values.includes("Tomatoes"))).toBe(true);
  });

  it("finds birthday and anniversary members for occasion-aware suggestions", async () => {
    const db = { prepare: (sql: string) => {
      const statement = { bind: () => statement, async all() {
        expect(sql).toContain("household_events");
        return { results: [{ memberId: "gillian" }] };
      } };
      return statement;
    } } as unknown as D1Database;
    await expect(occasionMembers(db, "home", "2026-08-05")).resolves.toEqual(["gillian"]);
  });

  it("returns safe duplicate candidates without a merge operation", async () => {
    const db = { prepare: (sql: string) => {
      const statement = { bind: () => statement, async all() {
        return sql.includes("FROM meals") ? { results: [{ id: "recipe", name: "Homemade Lasagna" }] } :
          { results: [{ id: "fav", mealId: null, name: "Mum's Lasagne", memberName: "Gillian", memberId: "gillian" }] };
      } };
      return statement;
    } } as unknown as D1Database;
    const candidates = await mealDuplicateCandidates(db, "home");
    expect(candidates[0].entries.map(({ id }) => id)).toEqual(["recipe", "fav"]);
  });
});
