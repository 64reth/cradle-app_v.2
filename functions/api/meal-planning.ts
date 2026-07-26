import { identityAccessLevel, type Identity } from "./auth";
import { ApiError, authorizationError, conflictError, notFoundError, validationError } from "./http";
import {
  defaultWeekendSlots, MEAL_ASSIGNMENT_MODES, MEAL_TYPES, rankMealSuggestions,
  rotationWeekForDate, weekStartForDate, ROTATION_SLOT_KINDS, type MealAssignmentMode,
  findPotentialMealDuplicates, type MealDay, type MealDuplicateCandidate, type MealType, type RotationSlotKind
} from "../../shared/meals";

export type MealRow = {
  id: string; name: string; description: string | null; dietaryTags: string[]; allergens: string[];
  sourceKind: "recipe" | "custom"; isActive: number;
};

type FavouriteRow = {
  id: string; memberId: string; memberName: string; mealId: string | null; mealName: string | null; customMealName: string | null;
  priority: number; dietaryTags: string | null; allergens: string | null;
};

const list = (value: unknown): string[] => typeof value === "string"
  ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
const optionalText = (value: unknown, max: number): string | null => {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw validationError("Please check the submitted fields.");
  return value.trim() || null;
};
const requiredText = (value: unknown, field: string, max: number): string => {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > max) {
    throw validationError("Please check the submitted fields.", { [field]: `Must be 1-${max} characters` });
  }
  return value.trim();
};

export function requireMealManagement(identity: Identity): void {
  if (identityAccessLevel(identity) !== "household_admin") throw authorizationError();
}

export function parseWeekStart(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError("Choose a calendar week.", { weekStart: "Use YYYY-MM-DD" });
  }
  return weekStartForDate(value);
}

export function parseMealSlot(body: Record<string, unknown>, defaults: {
  week?: number; day?: number; mealType?: string; slotKind?: string
} = {}) {
  const week = Number(body.rotationWeekNumber ?? defaults.week ?? 1);
  const day = Number(body.dayOfWeek ?? defaults.day ?? 1);
  const mealType = String(body.mealType ?? defaults.mealType ?? "dinner") as MealType;
  const slotKind = String(body.slotKind ?? defaults.slotKind ?? "meal") as RotationSlotKind;
  if (!Number.isInteger(week) || week < 1 || week > 4) throw validationError("Choose a rotation week from 1 to 4.");
  if (!Number.isInteger(day) || day < 1 || day > 7) throw validationError("Choose a day from Monday to Sunday.");
  if (!MEAL_TYPES.includes(mealType)) throw validationError("Choose breakfast, lunch or dinner.");
  if (!ROTATION_SLOT_KINDS.includes(slotKind)) throw validationError("Choose a valid meal night.");
  const mealId = typeof body.mealId === "string" && body.mealId.trim() ? body.mealId.trim() : null;
  const customMealName = optionalText(body.customMealName, 160);
  const dayTheme = optionalText(body.dayTheme, 60);
  if (mealKindNeedsName(slotKind) && !mealId && !customMealName && !dayTheme) {
    throw validationError("Choose a meal or name this meal night.");
  }
  const assignmentMode = String(body.assignmentMode ?? "decide_later") as MealAssignmentMode;
  if (!MEAL_ASSIGNMENT_MODES.includes(assignmentMode)) throw validationError("Choose a valid cook assignment.");
  const assignedCookMemberId = typeof body.assignedCookMemberId === "string" && body.assignedCookMemberId.trim()
    ? body.assignedCookMemberId.trim() : null;
  if (assignmentMode === "one_person" && !assignedCookMemberId) throw validationError("Choose a cook for this meal.");
  return {
    rotationWeekNumber: week, dayOfWeek: day as MealDay, mealType, mealId, customMealName, slotKind,
    dayTheme, assignedCookMemberId, assignmentMode,
    notes: optionalText(body.notes, 1000), sortPosition: Number(body.sortPosition || 0)
  };
}

function mealKindNeedsName(slotKind: RotationSlotKind): boolean {
  return slotKind === "meal";
}

export async function activeMembers(db: D1Database, householdId: string) {
  return db.prepare(`SELECT id, display_name AS displayName, access_level AS accessLevel, age_band AS ageBand
    FROM members WHERE household_id = ? AND is_active = 1 AND lifecycle_state NOT IN ('left', 'suspended')
    ORDER BY created_at`).bind(householdId).all<{ id: string; displayName: string; accessLevel: string; ageBand: string }>();
}

export async function mealFavourites(db: D1Database, householdId: string) {
  const rows = await db.prepare(`SELECT f.id, f.member_id AS memberId, m.display_name AS memberName,
      f.meal_id AS mealId, COALESCE(f.custom_meal_name, meal.name) AS mealName, f.custom_meal_name AS customMealName, f.priority,
      COALESCE(meal.dietary_tags, '') AS dietaryTags, COALESCE(meal.allergens, '') AS allergens
    FROM meal_favourites f JOIN members m ON m.household_id = f.household_id AND m.id = f.member_id
    LEFT JOIN meals meal ON meal.household_id = f.household_id AND meal.id = f.meal_id AND meal.is_active = 1
    WHERE f.household_id = ? AND m.is_active = 1 AND m.lifecycle_state NOT IN ('left', 'suspended')
    ORDER BY f.priority DESC, f.created_at`).bind(householdId).all<FavouriteRow>();
  return rows.results.map((row) => ({
    id: row.id, memberId: row.memberId, memberName: row.memberName, mealId: row.mealId,
    mealName: row.mealName || row.customMealName || "", priority: row.priority, dietaryTags: list(row.dietaryTags), allergens: list(row.allergens)
  }));
}

export async function mealConstraints(db: D1Database, householdId: string) {
  const rows = await db.prepare(`SELECT dietary_requirements AS dietaryRequirements, allergies, dislikes
    FROM member_meal_preferences WHERE household_id = ?`).bind(householdId).all<{
      dietaryRequirements: string | null; allergies: string | null; dislikes: string | null
    }>();
  return {
    dietaryTags: rows.results.flatMap(({ dietaryRequirements }) => list(dietaryRequirements)),
    allergens: rows.results.flatMap(({ allergies }) => list(allergies)),
    dislikes: rows.results.flatMap(({ dislikes }) => list(dislikes))
  };
}

export async function mealSuggestions(db: D1Database, householdId: string, options: {
  occasionDate?: string; occasionMemberIds?: string[];
} = {}) {
  const preferences = await mealFavourites(db, householdId);
  const constraints = await mealConstraints(db, householdId);
  const occasionMemberIds = options.occasionMemberIds || (options.occasionDate ? await occasionMembers(db, householdId, options.occasionDate) : []);
  const meals = await db.prepare(`SELECT id, name, dietary_tags AS dietaryTags, allergens
    FROM meals WHERE household_id = ? AND is_active = 1`).bind(householdId).all<{
      id: string; name: string; dietaryTags: string | null; allergens: string | null
    }>();
  const byId = new Map(meals.results.map((meal) => [meal.id, meal]));
  const ranked = preferences.map((preference) => {
    const meal = preference.mealId ? byId.get(preference.mealId) : undefined;
    return { ...preference, mealName: meal?.name || preference.mealName,
      dietaryTags: meal ? list(meal.dietaryTags) : preference.dietaryTags,
      allergens: meal ? list(meal.allergens) : preference.allergens };
  });
  const linkedMealIds = new Set(preferences.map(({ mealId }) => mealId).filter((mealId): mealId is string => Boolean(mealId)));
  for (const meal of meals.results) {
    if (linkedMealIds.has(meal.id)) continue;
    ranked.push({ id: `recipe:${meal.id}`, memberId: "", memberName: "", mealId: meal.id, mealName: meal.name,
      priority: 0, dietaryTags: list(meal.dietaryTags), allergens: list(meal.allergens) });
  }
  return rankMealSuggestions(ranked, { ...constraints, occasionMemberIds });
}

export async function occasionMembers(db: D1Database, householdId: string, date: string): Promise<string[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
  const rows = await db.prepare(`SELECT DISTINCT em.member_id AS memberId
    FROM household_events e JOIN household_event_members em
      ON em.household_id = e.household_id AND em.event_id = e.id
    WHERE e.household_id = ? AND e.status = 'active'
      AND (e.event_type = 'birthday' OR lower(e.title) LIKE '%anniversary%')
      AND substr(e.starts_at, 6, 5) = substr(?, 6, 5)`).bind(householdId, date).all<{ memberId: string }>();
  return rows.results.map(({ memberId }) => memberId);
}

export async function mealDuplicateCandidates(db: D1Database, householdId: string): Promise<MealDuplicateCandidate[]> {
  const meals = await db.prepare(`SELECT id, name FROM meals WHERE household_id = ? AND is_active = 1 ORDER BY name`)
    .bind(householdId).all<{ id: string; name: string }>();
  const favourites = await db.prepare(`SELECT f.id, f.meal_id AS mealId, f.custom_meal_name AS name,
      m.display_name AS memberName, f.member_id AS memberId
    FROM meal_favourites f JOIN members m ON m.household_id = f.household_id AND m.id = f.member_id
    WHERE f.household_id = ? AND f.custom_meal_name IS NOT NULL AND m.is_active = 1`)
    .bind(householdId).all<{ id: string; mealId: string | null; name: string; memberName: string; memberId: string }>();
  return findPotentialMealDuplicates([
    ...meals.results.map((meal) => ({ id: meal.id, name: meal.name, source: "recipe" as const, mealId: meal.id })),
    ...favourites.results.map((favourite) => ({ id: favourite.id, name: favourite.name, source: "favourite" as const,
      memberName: favourite.memberName, memberId: favourite.memberId, mealId: favourite.mealId }))
  ]);
}

async function assertMealBelongs(db: D1Database, householdId: string, mealId: string | null): Promise<void> {
  if (!mealId) return;
  const meal = await db.prepare("SELECT id FROM meals WHERE household_id = ? AND id = ? AND is_active = 1")
    .bind(householdId, mealId).first();
  if (!meal) throw notFoundError("That meal is not in this household’s Recipe Bank.");
}

async function assertMemberBelongs(db: D1Database, householdId: string, memberId: string | null): Promise<void> {
  if (!memberId) return;
  const member = await db.prepare(`SELECT id FROM members WHERE household_id = ? AND id = ? AND is_active = 1
    AND lifecycle_state NOT IN ('left', 'suspended')`).bind(householdId, memberId).first();
  if (!member) throw notFoundError("Choose a current Family member.");
}

export async function createRotation(db: D1Database, identity: Identity, body: Record<string, unknown>) {
  requireMealManagement(identity);
  const title = requiredText(body.title, "title", 160);
  const description = optionalText(body.description, 1000);
  const cycleLengthWeeks = Number(body.cycleLengthWeeks || 4);
  if (![1, 2, 3, 4].includes(cycleLengthWeeks)) throw validationError("The rotation can be one to four weeks long.");
  const startsOn = body.startsOn === null || body.startsOn === undefined || body.startsOn === ""
    ? null : parseWeekStart(body.startsOn);
  const slots = Array.isArray(body.slots) ? body.slots : [];
  const now = new Date().toISOString(); const id = crypto.randomUUID();
  const parsed = slots.map((slot) => parseMealSlot(slot as Record<string, unknown>));
  for (const slot of parsed) {
    await assertMealBelongs(db, identity.householdId, slot.mealId);
    await assertMemberBelongs(db, identity.householdId, slot.assignedCookMemberId);
  }
  await db.batch([
    db.prepare(`INSERT INTO meal_rotations
      (id, household_id, title, description, cycle_length_weeks, active, starts_on, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`).bind(id, identity.householdId, title, description, cycleLengthWeeks, startsOn, now, now),
    ...parsed.map((slot) => db.prepare(`INSERT INTO meal_rotation_slots
      (id, household_id, meal_rotation_id, rotation_week_number, day_of_week, meal_type, meal_id, custom_meal_name,
       slot_kind, day_theme, assigned_cook_member_id, assignment_mode, notes, sort_position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), identity.householdId, id, slot.rotationWeekNumber, slot.dayOfWeek, slot.mealType,
        slot.mealId, slot.customMealName, slot.slotKind, slot.dayTheme, slot.assignedCookMemberId, slot.assignmentMode,
        slot.notes, slot.sortPosition, now, now))
  ]);
  return id;
}

export async function activateRotation(db: D1Database, identity: Identity, rotationId: string): Promise<void> {
  requireMealManagement(identity);
  const existingRotation = await db.prepare("SELECT id FROM meal_rotations WHERE household_id = ? AND id = ?")
    .bind(identity.householdId, rotationId).first();
  if (!existingRotation) throw notFoundError("That meal rotation is not available.");
  const now = new Date().toISOString();
  const rotationConfig = await db.prepare("SELECT cycle_length_weeks AS cycleLengthWeeks FROM meal_rotations WHERE household_id = ? AND id = ?")
    .bind(identity.householdId, rotationId).first<{ cycleLengthWeeks: number }>();
  const existingSlot = await db.prepare("SELECT id FROM meal_rotation_slots WHERE household_id = ? AND meal_rotation_id = ? LIMIT 1")
    .bind(identity.householdId, rotationId).first();
  const defaults = existingSlot ? [] : Array.from({ length: (rotationConfig?.cycleLengthWeeks || 4) * 7 }, (_, index) => {
    const week = Math.floor(index / 7) + 1; const day = (index % 7) + 1;
    return db.prepare(`INSERT OR IGNORE INTO meal_rotation_slots
      (id, household_id, meal_rotation_id, rotation_week_number, day_of_week, meal_type, slot_kind,
       assignment_mode, sort_position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'dinner', 'flexible', 'decide_later', ?, ?, ?)`)
      .bind(crypto.randomUUID(), identity.householdId, rotationId, week, day, day, now, now);
  });
  await db.batch([
    db.prepare("UPDATE meal_rotations SET active = 0, updated_at = ? WHERE household_id = ?").bind(now, identity.householdId),
    db.prepare("UPDATE meal_rotations SET active = 1, updated_at = ? WHERE household_id = ? AND id = ?").bind(now, identity.householdId, rotationId),
    ...defaults
  ]);
}

export async function rotationData(db: D1Database, householdId: string, rotationId?: string) {
  const rotation = await db.prepare(`SELECT id, title, description, cycle_length_weeks AS cycleLengthWeeks,
      active, starts_on AS startsOn, created_at AS createdAt, updated_at AS updatedAt
    FROM meal_rotations WHERE household_id = ? ${rotationId ? "AND id = ?" : "AND active = 1"}
    ORDER BY active DESC, created_at DESC LIMIT 1`).bind(householdId, ...(rotationId ? [rotationId] : [])).first();
  if (!rotation) return null;
  const slots = await db.prepare(`SELECT s.id, s.rotation_week_number AS rotationWeekNumber, s.day_of_week AS dayOfWeek,
      s.meal_type AS mealType, s.meal_id AS mealId, COALESCE(m.name, s.custom_meal_name) AS mealName,
      s.custom_meal_name AS customMealName, s.slot_kind AS slotKind, s.day_theme AS dayTheme,
      s.assigned_cook_member_id AS assignedCookMemberId, s.assignment_mode AS assignmentMode,
      s.notes, s.sort_position AS sortPosition
    FROM meal_rotation_slots s LEFT JOIN meals m ON m.household_id = s.household_id AND m.id = s.meal_id
    WHERE s.household_id = ? AND s.meal_rotation_id = ? ORDER BY s.rotation_week_number, s.day_of_week, s.sort_position`)
    .bind(householdId, rotation.id).all();
  return { ...rotation, slots: slots.results, suggestions: await mealSuggestions(db, householdId) };
}

export async function generateWeeklyMealPlan(db: D1Database, identity: Identity, requestedWeek: string, rotationId?: string) {
  const weekStart = parseWeekStart(requestedWeek);
  const rotation = await db.prepare(`SELECT id, cycle_length_weeks AS cycleLengthWeeks, starts_on AS startsOn
    FROM meal_rotations WHERE household_id = ? ${rotationId ? "AND id = ?" : "AND active = 1"}
    ORDER BY active DESC, created_at DESC LIMIT 1`).bind(identity.householdId, ...(rotationId ? [rotationId] : [])).first<{
      id: string; cycleLengthWeeks: number; startsOn: string | null
    }>();
  const rotationWeekNumber = rotation ? rotationWeekForDate(weekStart, rotation.startsOn, rotation.cycleLengthWeeks) : null;
  const existing = await db.prepare("SELECT id FROM weekly_meal_plans WHERE household_id = ? AND week_start = ?")
    .bind(identity.householdId, weekStart).first<{ id: string }>();
  const planId = existing?.id || crypto.randomUUID(); const now = new Date().toISOString();
  if (!existing) {
    await db.prepare(`INSERT INTO weekly_meal_plans
      (id, household_id, week_start, source_rotation_id, rotation_week_number, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`).bind(planId, identity.householdId, weekStart, rotation?.id || null,
      rotationWeekNumber, now, now).run();
  }
  const sourceSlots = rotation && rotationWeekNumber
      ? await db.prepare(`SELECT id, day_of_week AS dayOfWeek, meal_type AS mealType, meal_id AS mealId,
        custom_meal_name AS customMealName, slot_kind AS slotKind, day_theme AS dayTheme, assigned_cook_member_id AS assignedCookMemberId,
        assignment_mode AS assignmentMode, notes, sort_position AS sortPosition
      FROM meal_rotation_slots WHERE household_id = ? AND meal_rotation_id = ? AND rotation_week_number = ?
        ORDER BY day_of_week, sort_position`).bind(identity.householdId, rotation.id, rotationWeekNumber).all<{
          id: string; dayOfWeek: number; mealType: string; mealId: string | null; customMealName: string | null;
          slotKind: string; dayTheme: string | null; assignedCookMemberId: string | null; assignmentMode: string; notes: string | null; sortPosition: number
        }>() : { results: [] };
  const statements = sourceSlots.results.map((slot) => db.prepare(`INSERT OR IGNORE INTO weekly_meal_plan_slots
    (id, household_id, weekly_meal_plan_id, day_of_week, meal_type, meal_id, custom_meal_name, slot_kind, day_theme,
     source_rotation_slot_id, override_kind, assigned_cook_member_id, assignment_mode, notes, sort_position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), identity.householdId, planId, slot.dayOfWeek, slot.mealType, slot.mealId, slot.customMealName, slot.slotKind, slot.dayTheme,
      slot.id, slot.assignedCookMemberId, slot.assignmentMode, slot.notes, slot.sortPosition, now, now));
  const existingSlots = await db.prepare("SELECT day_of_week AS dayOfWeek, meal_type AS mealType FROM weekly_meal_plan_slots WHERE household_id = ? AND weekly_meal_plan_id = ?")
    .bind(identity.householdId, planId).all<{ dayOfWeek: number; mealType: string }>();
  const keys = new Set(existingSlots.results.map(({ dayOfWeek, mealType }) => `${dayOfWeek}:${mealType}`));
  for (const slot of sourceSlots.results) keys.add(`${slot.dayOfWeek}:${slot.mealType}`);
  if (!sourceSlots.results.length) for (let day = 1; day <= 7; day += 1) {
    if (keys.has(`${day}:dinner`)) continue;
    statements.push(db.prepare(`INSERT OR IGNORE INTO weekly_meal_plan_slots
      (id, household_id, weekly_meal_plan_id, day_of_week, meal_type, slot_kind, override_kind,
       assignment_mode, sort_position, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'dinner', 'flexible', 'none', 'decide_later', ?, ?, ?)`)
      .bind(crypto.randomUUID(), identity.householdId, planId, day, day, now, now));
  }
  const legacyDinnerWeek = sourceSlots.results.length >= 7 && sourceSlots.results.every(({ mealType }) => mealType === "dinner");
  for (const slot of legacyDinnerWeek ? defaultWeekendSlots() : []) {
    if (keys.has(`${slot.dayOfWeek}:${slot.mealType}`)) continue;
    statements.push(db.prepare(`INSERT OR IGNORE INTO weekly_meal_plan_slots
      (id, household_id, weekly_meal_plan_id, day_of_week, meal_type, slot_kind, override_kind,
       assignment_mode, sort_position, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'none', 'decide_later', ?, ?, ?)`).bind(
        crypto.randomUUID(), identity.householdId, planId, slot.dayOfWeek, slot.mealType, slot.slotKind, slot.dayOfWeek, now, now));
  }
  if (statements.length) await db.batch(statements);
  return weeklyPlanData(db, identity.householdId, planId);
}

export async function regenerateWeeklyMealPlan(db: D1Database, identity: Identity, requestedWeek: string, rotationId?: string, slotIds?: string[]) {
  requireMealManagement(identity);
  const weekStart = parseWeekStart(requestedWeek);
  const existing = await db.prepare("SELECT id FROM weekly_meal_plans WHERE household_id = ? AND week_start = ?")
    .bind(identity.householdId, weekStart).first<{ id: string }>();
  if (existing) {
    const ids = (slotIds || []).filter((id) => typeof id === "string" && id.trim()).map((id) => id.trim());
    const where = ids.length ? `AND id IN (${ids.map(() => "?").join(",")})` : "";
    await db.prepare(`DELETE FROM weekly_meal_plan_slots WHERE household_id = ? AND weekly_meal_plan_id = ? AND override_kind = 'none' ${where}`)
      .bind(identity.householdId, existing.id, ...ids).run();
  }
  return generateWeeklyMealPlan(db, identity, weekStart, rotationId);
}

export async function weeklyPlanData(db: D1Database, householdId: string, planId: string) {
  const plan = await db.prepare(`SELECT p.id, p.week_start AS weekStart, p.source_rotation_id AS sourceRotationId,
      p.rotation_week_number AS rotationWeekNumber, p.status, p.created_at AS createdAt, p.updated_at AS updatedAt,
      r.title AS rotationTitle
    FROM weekly_meal_plans p LEFT JOIN meal_rotations r ON r.household_id = p.household_id AND r.id = p.source_rotation_id
    WHERE p.household_id = ? AND p.id = ?`).bind(householdId, planId).first();
  if (!plan) throw notFoundError("That weekly meal plan is not available.");
  const slots = await db.prepare(`SELECT s.id, s.day_of_week AS dayOfWeek, s.meal_type AS mealType,
      s.meal_id AS mealId, COALESCE(m.name, s.custom_meal_name) AS mealName, s.custom_meal_name AS customMealName,
      s.slot_kind AS slotKind, s.day_theme AS dayTheme, s.source_rotation_slot_id AS sourceRotationSlotId, s.override_kind AS overrideKind,
      s.special_occasion_title AS specialOccasionTitle, s.assigned_cook_member_id AS assignedCookMemberId,
      source.meal_id AS sourceMealId, COALESCE(sourceMeal.name, source.custom_meal_name) AS sourceMealName,
      source.custom_meal_name AS sourceCustomMealName, source.slot_kind AS sourceSlotKind,
      s.assignment_mode AS assignmentMode, s.notes, s.sort_position AS sortPosition
    FROM weekly_meal_plan_slots s LEFT JOIN meals m ON m.household_id = s.household_id AND m.id = s.meal_id
    LEFT JOIN meal_rotation_slots source ON source.household_id = s.household_id AND source.id = s.source_rotation_slot_id
    LEFT JOIN meals sourceMeal ON sourceMeal.household_id = source.household_id AND sourceMeal.id = source.meal_id
    WHERE s.household_id = ? AND s.weekly_meal_plan_id = ? ORDER BY s.day_of_week, s.sort_position`)
    .bind(householdId, planId).all();
  return { ...plan, slots: slots.results };
}

export async function updateWeeklySlot(db: D1Database, identity: Identity, planId: string, slotId: string, body: Record<string, unknown>) {
  requireMealManagement(identity);
  const existing = await db.prepare(`SELECT s.id, s.source_rotation_slot_id AS sourceRotationSlotId,
      s.day_of_week AS dayOfWeek, s.meal_type AS mealType, p.source_rotation_id AS sourceRotationId
    FROM weekly_meal_plan_slots s JOIN weekly_meal_plans p ON p.household_id = s.household_id AND p.id = s.weekly_meal_plan_id
    WHERE s.household_id = ? AND s.weekly_meal_plan_id = ? AND s.id = ?`).bind(identity.householdId, planId, slotId)
    .first<{ id: string; sourceRotationSlotId: string | null; dayOfWeek: number; mealType: string; sourceRotationId: string | null }>();
  if (!existing) throw notFoundError("That weekly meal is not available.");
  const quickAction = typeof body.action === "string" ? body.action : "";
  if (["remove", "eating_away", "restore", "keep", "move"].includes(quickAction)) {
    const now = new Date().toISOString();
    if (quickAction === "keep") {
      await db.prepare(`UPDATE weekly_meal_plan_slots SET override_kind = 'this_week', updated_at = ?
        WHERE household_id = ? AND weekly_meal_plan_id = ? AND id = ?`).bind(now, identity.householdId, planId, slotId).run();
      return weeklyPlanData(db, identity.householdId, planId);
    }
    if (quickAction === "move") {
      const targetDay = Number(body.targetDay);
      if (!Number.isInteger(targetDay) || targetDay < 1 || targetDay > 7) throw validationError("Choose a day from Monday to Sunday.");
      const collision = await db.prepare(`SELECT id FROM weekly_meal_plan_slots
        WHERE household_id = ? AND weekly_meal_plan_id = ? AND day_of_week = ? AND meal_type = ? AND id != ?`)
        .bind(identity.householdId, planId, targetDay, existing.mealType, slotId).first();
      if (collision) throw conflictError("That day already has a meal of this type. Choose another day.");
      await db.prepare(`UPDATE weekly_meal_plan_slots SET day_of_week = ?, override_kind = 'this_week', updated_at = ?
        WHERE household_id = ? AND weekly_meal_plan_id = ? AND id = ?`).bind(targetDay, now, identity.householdId, planId, slotId).run();
      return weeklyPlanData(db, identity.householdId, planId);
    }
    if (quickAction === "restore") {
      if (!existing.sourceRotationSlotId || !existing.sourceRotationId) throw conflictError("There is no original suggestion to restore.");
      const source = await db.prepare(`SELECT meal_id AS mealId, custom_meal_name AS customMealName, slot_kind AS slotKind,
          day_theme AS dayTheme, notes FROM meal_rotation_slots
        WHERE household_id = ? AND meal_rotation_id = ? AND id = ?`).bind(identity.householdId, existing.sourceRotationId, existing.sourceRotationSlotId)
        .first<{ mealId: string | null; customMealName: string | null; slotKind: RotationSlotKind; dayTheme: string | null; notes: string | null }>();
      if (!source) throw conflictError("There is no original suggestion to restore.");
      await db.prepare(`UPDATE weekly_meal_plan_slots SET meal_id = ?, custom_meal_name = ?, slot_kind = ?, day_theme = ?,
        override_kind = 'none', special_occasion_title = NULL, notes = ?, updated_at = ?
        WHERE household_id = ? AND weekly_meal_plan_id = ? AND id = ?`).bind(
        source.mealId, source.customMealName, source.slotKind, source.dayTheme, source.notes, now,
        identity.householdId, planId, slotId).run();
    } else {
      const away = quickAction === "eating_away";
      await db.prepare(`UPDATE weekly_meal_plan_slots SET meal_id = NULL, custom_meal_name = NULL, slot_kind = ?,
        override_kind = 'this_week', special_occasion_title = NULL, notes = ?, updated_at = ?
        WHERE household_id = ? AND weekly_meal_plan_id = ? AND id = ?`).bind(
        away ? "eating_out" : "flexible", optionalText(body.notes, 1000), now,
        identity.householdId, planId, slotId).run();
    }
    return weeklyPlanData(db, identity.householdId, planId);
  }
  const action = body.editScope === "repeating_rotation" ? "repeating_rotation" : body.editScope === "special_occasion" ? "special_occasion" : "this_week";
  const mealId = typeof body.mealId === "string" && body.mealId.trim() ? body.mealId.trim() : null;
  const customMealName = optionalText(body.customMealName, 160);
  const mealType = String(body.mealType || existing.mealType) as MealType;
  if (!MEAL_TYPES.includes(mealType)) throw validationError("Choose breakfast, lunch or dinner.");
  if (mealType !== existing.mealType) {
    const collision = await db.prepare(`SELECT id FROM weekly_meal_plan_slots
      WHERE household_id = ? AND weekly_meal_plan_id = ? AND day_of_week = ? AND meal_type = ? AND id != ?`)
      .bind(identity.householdId, planId, existing.dayOfWeek, mealType, slotId).first();
    if (collision) throw conflictError("That day already has a meal of this type. Choose another meal type.");
  }
  const slotKind = String(body.slotKind || "meal") as RotationSlotKind;
  if (!ROTATION_SLOT_KINDS.includes(slotKind)) throw validationError("Choose a valid meal night.");
  await assertMealBelongs(db, identity.householdId, mealId); await assertMemberBelongs(db, identity.householdId,
    typeof body.assignedCookMemberId === "string" ? body.assignedCookMemberId : null);
  const now = new Date().toISOString();
  if (action === "repeating_rotation") {
    if (!existing.sourceRotationSlotId || !existing.sourceRotationId) throw conflictError("This meal does not come from a repeating rotation yet.");
    await db.batch([
      db.prepare(`UPDATE meal_rotation_slots SET meal_type = ?, meal_id = ?, custom_meal_name = ?, slot_kind = ?, day_theme = ?, notes = ?, updated_at = ?
        WHERE household_id = ? AND meal_rotation_id = ? AND id = ?`).bind(mealType, mealId, customMealName, slotKind,
        optionalText(body.dayTheme, 60), optionalText(body.notes, 1000), now, identity.householdId, existing.sourceRotationId, existing.sourceRotationSlotId),
      db.prepare(`UPDATE weekly_meal_plan_slots SET meal_type = ?, meal_id = ?, custom_meal_name = ?, slot_kind = ?, day_theme = ?, override_kind = 'none',
        special_occasion_title = NULL, notes = ?, updated_at = ? WHERE household_id = ? AND weekly_meal_plan_id = ? AND id = ?`)
        .bind(mealType, mealId, customMealName, slotKind, optionalText(body.dayTheme, 60), optionalText(body.notes, 1000), now, identity.householdId, planId, slotId)
    ]);
  } else {
    await db.prepare(`UPDATE weekly_meal_plan_slots SET meal_type = ?, meal_id = ?, custom_meal_name = ?, slot_kind = ?, day_theme = ?,
      override_kind = ?, special_occasion_title = ?, notes = ?, updated_at = ?
      WHERE household_id = ? AND weekly_meal_plan_id = ? AND id = ?`).bind(
      mealType, mealId, customMealName, slotKind, optionalText(body.dayTheme, 60), action === "special_occasion" ? "special_occasion" : "this_week",
      action === "special_occasion" ? optionalText(body.specialOccasionTitle, 160) : null,
      optionalText(body.notes, 1000), now, identity.householdId, planId, slotId).run();
  }
  return weeklyPlanData(db, identity.householdId, planId);
}

export async function confirmWeeklyPlan(db: D1Database, identity: Identity, planId: string) {
  requireMealManagement(identity);
  const now = new Date().toISOString();
  const result = await db.prepare(`UPDATE weekly_meal_plans SET status = 'active', updated_at = ?
    WHERE household_id = ? AND id = ?`).bind(now, identity.householdId, planId).run();
  if (!result.meta.changes) throw notFoundError("That weekly meal plan is not available.");
  return weeklyPlanData(db, identity.householdId, planId);
}

export async function refreshShoppingList(db: D1Database, householdId: string, planId: string) {
  const plan = await db.prepare("SELECT id FROM weekly_meal_plans WHERE household_id = ? AND id = ?").bind(householdId, planId).first();
  if (!plan) throw notFoundError("That weekly meal plan is not available.");
  const listId = crypto.randomUUID(); const now = new Date().toISOString();
  await db.prepare(`INSERT INTO meal_shopping_lists (id, household_id, weekly_meal_plan_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?) ON CONFLICT(household_id, weekly_meal_plan_id) DO UPDATE SET updated_at = excluded.updated_at`)
    .bind(listId, householdId, planId, now, now).run();
  const listRow = await db.prepare("SELECT id FROM meal_shopping_lists WHERE household_id = ? AND weekly_meal_plan_id = ?")
    .bind(householdId, planId).first<{ id: string }>();
  if (!listRow) throw new ApiError(500, "SHOPPING_LIST_UNAVAILABLE", "Cradle could not prepare the shopping list.");
  await db.prepare("DELETE FROM meal_shopping_list_items WHERE household_id = ? AND shopping_list_id = ?").bind(householdId, listRow.id).run();
  const items = await db.prepare(`SELECT i.ingredient_name AS ingredientName, i.quantity
    FROM weekly_meal_plan_slots s JOIN meal_ingredients i ON i.household_id = s.household_id AND i.meal_id = s.meal_id
    WHERE s.household_id = ? AND s.weekly_meal_plan_id = ? AND s.slot_kind = 'meal'
    ORDER BY i.ingredient_name`).bind(householdId, planId).all<{ ingredientName: string; quantity: string | null }>();
  if (items.results.length) await db.batch(items.results.map((item) => db.prepare(`INSERT INTO meal_shopping_list_items
    (id, household_id, shopping_list_id, ingredient_name, quantity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), householdId, listRow.id, item.ingredientName, item.quantity, now, now)));
  return db.prepare(`SELECT id, ingredient_name AS ingredientName, quantity, is_checked AS isChecked
    FROM meal_shopping_list_items WHERE household_id = ? AND shopping_list_id = ? ORDER BY ingredient_name`)
    .bind(householdId, listRow.id).all();
}
