export const MEAL_TYPES = ["breakfast", "lunch", "dinner"] as const;
export type MealType = typeof MEAL_TYPES[number];

export const ROTATION_SLOT_KINDS = ["meal", "leftovers", "eating_out", "takeaway", "flexible", "special_theme"] as const;
export type RotationSlotKind = typeof ROTATION_SLOT_KINDS[number];

export const MEAL_ASSIGNMENT_MODES = ["rotation", "one_person", "shared_team", "decide_later"] as const;
export type MealAssignmentMode = typeof MEAL_ASSIGNMENT_MODES[number];

export const MEAL_DAYS = [
  { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" }, { value: 5, label: "Friday" }, { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" }
] as const;
export type MealDay = typeof MEAL_DAYS[number]["value"];

export const MEAL_DAY_THEMES = [
  { value: "quick_meal", label: "Quick meal" },
  { value: "family_favourite", label: "Family favourite" },
  { value: "healthy_choice", label: "Healthy choice" },
  { value: "curry_one_pot", label: "Curry or one-pot" },
  { value: "fun_friday", label: "Fun Friday" },
  { value: "something_different", label: "Something different" },
  { value: "family_dinner", label: "Family dinner" }
] as const;
export type MealDayTheme = typeof MEAL_DAY_THEMES[number]["value"];

export type MealPreference = {
  id: string; memberId: string; memberName: string; mealId: string | null;
  mealName: string; priority: number; dietaryTags: string[]; allergens: string[];
};

export type MealSuggestion = {
  name: string; mealId: string | null; supportCount: number; priority: number;
  favouriteOf: string[]; dietaryTags: string[]; allergens: string[];
  occasionSupportCount?: number;
};

export type MealDuplicateEntry = {
  id: string; name: string; source: "recipe" | "favourite"; memberName?: string | null;
  memberId?: string | null; mealId?: string | null;
};

export type MealDuplicateCandidate = {
  entries: MealDuplicateEntry[]; reason: "same_name" | "similar_name";
};

const dayMs = 86_400_000;

function utcDate(value: string | Date): Date {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  return new Date(`${text}T00:00:00Z`);
}

export function weekStartForDate(value: string | Date): string {
  const date = utcDate(value);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

export function rotationWeekForDate(value: string | Date, startsOn: string | null, cycleLengthWeeks = 4): number {
  const cycle = Math.max(1, Math.min(4, cycleLengthWeeks));
  const anchor = utcDate(startsOn || "2024-01-01");
  const week = utcDate(weekStartForDate(value));
  const anchorWeek = utcDate(weekStartForDate(anchor));
  const elapsed = Math.floor((week.getTime() - anchorWeek.getTime()) / dayMs / 7);
  return ((elapsed % cycle) + cycle) % cycle + 1;
}

export function dayLabel(day: number): string {
  return MEAL_DAYS.find(({ value }) => value === day)?.label || `Day ${day}`;
}

export function rankMealSuggestions(
  preferences: MealPreference[], constraints: {
    allergens?: string[]; dietaryTags?: string[]; dislikes?: string[]; occasionMemberIds?: string[];
  } = {}
): MealSuggestion[] {
  const blockedAllergens = new Set((constraints.allergens || []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  const requiredTags = new Set((constraints.dietaryTags || []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  const dislikes = (constraints.dislikes || []).map((value) => value.trim().toLowerCase()).filter(Boolean);
  const occasionMembers = new Set(constraints.occasionMemberIds || []);
  const grouped = new Map<string, MealSuggestion>();
  for (const preference of preferences) {
    const allergens = preference.allergens.map((value) => value.toLowerCase());
    const tags = preference.dietaryTags.map((value) => value.toLowerCase());
    if (allergens.some((value) => blockedAllergens.has(value))) continue;
    if (requiredTags.size && !Array.from(requiredTags).every((value) => tags.includes(value))) continue;
    if (dislikes.some((value) => preference.mealName.toLowerCase().includes(value) || tags.some((tag) => tag.includes(value)))) continue;
    const key = preference.mealId || preference.mealName.trim().toLowerCase();
    const current = grouped.get(key);
    if (current) {
      current.supportCount += 1;
      current.priority = Math.max(current.priority, preference.priority);
      current.occasionSupportCount = (current.occasionSupportCount || 0) + (occasionMembers.has(preference.memberId) ? 1 : 0);
      if (!current.favouriteOf.includes(preference.memberName)) current.favouriteOf.push(preference.memberName);
    } else {
      grouped.set(key, {
        name: preference.mealName, mealId: preference.mealId, supportCount: 1,
        priority: preference.priority, favouriteOf: [preference.memberName],
        dietaryTags: preference.dietaryTags, allergens: preference.allergens,
        occasionSupportCount: occasionMembers.has(preference.memberId) ? 1 : 0
      });
    }
  }
  return Array.from(grouped.values()).sort((a, b) =>
    b.supportCount - a.supportCount || (b.occasionSupportCount || 0) - (a.occasionSupportCount || 0) ||
    b.priority - a.priority || a.name.localeCompare(b.name));
}

function duplicateKey(value: string): string[] {
  const aliases: Record<string, string> = { lasagne: "lasagna", mums: "", mum: "", homemade: "", family: "" };
  return value.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .map((token) => aliases[token] ?? token).filter(Boolean).sort();
}

export function findPotentialMealDuplicates(entries: MealDuplicateEntry[]): MealDuplicateCandidate[] {
  const candidates: MealDuplicateCandidate[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < entries.length; otherIndex += 1) {
      const left = duplicateKey(entries[index].name); const right = duplicateKey(entries[otherIndex].name);
      if (!left.length || !right.length) continue;
      const leftText = left.join(" "); const rightText = right.join(" ");
      const overlap = left.filter((token) => right.includes(token)).length;
      const same = leftText === rightText;
      const similar = !same && overlap / Math.max(left.length, right.length) >= 0.6;
      if (same || similar) candidates.push({ entries: [entries[index], entries[otherIndex]], reason: same ? "same_name" : "similar_name" });
    }
  }
  return candidates;
}

export function favouriteContext(suggestion: MealSuggestion): string {
  if (!suggestion.favouriteOf.length || !suggestion.favouriteOf.some(Boolean)) return "From your Recipe Bank";
  if (suggestion.favouriteOf.length > 1) {
    const last = suggestion.favouriteOf[suggestion.favouriteOf.length - 1];
    return `Favourite of ${suggestion.favouriteOf.slice(0, -1).join(", ")} and ${last}`;
  }
  return `${suggestion.favouriteOf[0]}'s top choice`;
}

export function defaultWeekendSlots(): Array<{ dayOfWeek: MealDay; mealType: MealType; slotKind: RotationSlotKind }> {
  return [6, 7].flatMap((dayOfWeek) => [
    { dayOfWeek: dayOfWeek as MealDay, mealType: "breakfast" as const, slotKind: "flexible" as const },
    { dayOfWeek: dayOfWeek as MealDay, mealType: "lunch" as const, slotKind: "flexible" as const }
  ]);
}
