import { describe, expect, it } from "vitest";
import {
  defaultWeekendSlots, favouriteContext, findPotentialMealDuplicates, rankMealSuggestions, rotationWeekForDate, weekStartForDate
} from "../shared/meals";

describe("meal rotation foundation", () => {
  it("calculates Monday week starts and cycles through four rotation weeks", () => {
    expect(weekStartForDate("2026-08-05")).toBe("2026-08-03");
    expect(rotationWeekForDate("2024-01-01", null, 4)).toBe(1);
    expect(rotationWeekForDate("2024-01-22", null, 4)).toBe(4);
    expect(rotationWeekForDate("2024-01-29", null, 4)).toBe(1);
    expect(rotationWeekForDate("2026-08-05", "2026-08-03", 4)).toBe(1);
  });

  it("creates the four operational weekend breakfast/lunch slots", () => {
    expect(defaultWeekendSlots()).toEqual([
      { dayOfWeek: 6, mealType: "breakfast", slotKind: "flexible" },
      { dayOfWeek: 6, mealType: "lunch", slotKind: "flexible" },
      { dayOfWeek: 7, mealType: "breakfast", slotKind: "flexible" },
      { dayOfWeek: 7, mealType: "lunch", slotKind: "flexible" }
    ]);
  });

  it("ranks shared favourites while preserving intentional repetition", () => {
    const suggestions = rankMealSuggestions([
      { id: "a", memberId: "g", memberName: "Gareth", mealId: "pasta", mealName: "Pasta", priority: 3, dietaryTags: [], allergens: [] },
      { id: "b", memberId: "t", memberName: "Taryn", mealId: "pasta", mealName: "Pasta", priority: 1, dietaryTags: [], allergens: [] },
      { id: "c", memberId: "g", memberName: "Gareth", mealId: null, mealName: "Friday pizza", priority: 5, dietaryTags: [], allergens: [] }
    ]);
    expect(suggestions[0].name).toBe("Pasta");
    expect(suggestions[0].supportCount).toBe(2);
    expect(favouriteContext(suggestions[0])).toBe("Favourite of Gareth and Taryn");
    expect(suggestions[1].name).toBe("Friday pizza");
  });

  it("filters favourites that conflict with household constraints", () => {
    const suggestions = rankMealSuggestions([
      { id: "a", memberId: "g", memberName: "Gareth", mealId: "fish", mealName: "Fish pie", priority: 5, dietaryTags: [], allergens: ["fish"] },
      { id: "b", memberId: "g", memberName: "Gareth", mealId: "veg", mealName: "Veggie chilli", priority: 1, dietaryTags: ["vegetarian"], allergens: [] }
    ], { allergens: ["fish"] });
    expect(suggestions.map(({ name }) => name)).toEqual(["Veggie chilli"]);
  });

  it("keeps general Recipe Bank meals available when no favourites exist", () => {
    const suggestions = rankMealSuggestions([{
      id: "recipe-1", memberId: "", memberName: "", mealId: "meal-1", mealName: "Pasta",
      priority: 0, dietaryTags: [], allergens: []
    }]);
    expect(favouriteContext(suggestions[0])).toBe("From your Recipe Bank");
  });

  it("filters meals matching a saved dislike", () => {
    const suggestions = rankMealSuggestions([
      { id: "a", memberId: "g", memberName: "Gareth", mealId: null, mealName: "Fish pie", priority: 1, dietaryTags: [], allergens: [] },
      { id: "b", memberId: "g", memberName: "Gareth", mealId: null, mealName: "Pasta", priority: 1, dietaryTags: [], allergens: [] }
    ], { dislikes: ["fish"] });
    expect(suggestions.map(({ name }) => name)).toEqual(["Pasta"]);
  });

  it("boosts favourites belonging to a celebration member without losing household popularity", () => {
    const suggestions = rankMealSuggestions([
      { id: "a", memberId: "gillian", memberName: "Gillian", mealId: "pasta", mealName: "Pasta", priority: 1, dietaryTags: [], allergens: [] },
      { id: "b", memberId: "gareth", memberName: "Gareth", mealId: "curry", mealName: "Curry", priority: 1, dietaryTags: [], allergens: [] }
    ], { occasionMemberIds: ["gareth"] });
    expect(suggestions[0].name).toBe("Curry");
    expect(suggestions[0].occasionSupportCount).toBe(1);
  });

  it("detects duplicate candidates without merging original entries", () => {
    const candidates = findPotentialMealDuplicates([
      { id: "one", name: "Mum's Lasagne", source: "favourite" },
      { id: "two", name: "Homemade Lasagna", source: "recipe" },
      { id: "three", name: "Friday Pizza", source: "favourite" }
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].entries.map(({ id }) => id)).toEqual(["one", "two"]);
  });
});
