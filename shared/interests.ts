export const INTEREST_CATEGORIES = [
  "creative", "music", "sport_movement", "food_cooking", "games", "outdoors", "learning",
  "making_technology", "film_storytelling", "relaxing", "community_culture"
] as const;
export type InterestCategory = typeof INTEREST_CATEGORIES[number];

export const INTEREST_CATEGORY_LABELS: Record<InterestCategory, string> = {
  creative: "Creative", music: "Music", sport_movement: "Sport and movement", food_cooking: "Food and cooking",
  games: "Games", outdoors: "Outdoors", learning: "Learning", making_technology: "Making and technology",
  film_storytelling: "Film and storytelling", relaxing: "Relaxing", community_culture: "Community and culture"
};

export const SUGGESTED_INTERESTS: Array<{ name: string; category: InterestCategory }> = [
  { name: "Music", category: "music" }, { name: "Football", category: "sport_movement" },
  { name: "Cooking", category: "food_cooking" }, { name: "Films", category: "film_storytelling" },
  { name: "Photography", category: "creative" }, { name: "Drawing", category: "creative" },
  { name: "Gaming", category: "games" }, { name: "Gardening", category: "outdoors" },
  { name: "Dancing", category: "sport_movement" }, { name: "Walking", category: "outdoors" },
  { name: "Crafts", category: "creative" }, { name: "Reading", category: "learning" },
  { name: "Building things", category: "making_technology" }, { name: "Technology", category: "making_technology" },
  { name: "Board games", category: "games" }
];

export const INTEREST_LEVELS = ["like", "love", "try"] as const;
export type InterestLevel = typeof INTEREST_LEVELS[number];
export const INTEREST_LEVEL_LABELS: Record<InterestLevel, string> = { like: "Like it", love: "Love it", try: "Want to try it" };
export const INTEREST_SETTINGS = ["home", "outdoors", "either"] as const;
export type InterestSetting = typeof INTEREST_SETTINGS[number];
export const INTEREST_SETTING_LABELS: Record<InterestSetting, string> = { home: "At home", outdoors: "Outdoors", either: "Either" };
export const INTEREST_PARTICIPATION = ["alone", "one_to_one", "whole_family", "no_preference"] as const;
export type InterestParticipation = typeof INTEREST_PARTICIPATION[number];
export const INTEREST_PARTICIPATION_LABELS: Record<InterestParticipation, string> = {
  alone: "Alone", one_to_one: "One-to-one", whole_family: "Whole family", no_preference: "No preference"
};

export type MemberInterest = {
  id: string; name: string; category: InterestCategory | null; level: InterestLevel | null;
  setting: InterestSetting | null; participation: InterestParticipation | null; note: string | null; active: boolean;
};

export function interestCategoryMatches(category: InterestCategory | null, templateCategory: string, templateTitle = ""): boolean {
  const haystack = `${templateCategory} ${templateTitle}`.toLowerCase();
  const terms: Record<InterestCategory, string[]> = {
    creative: ["creative"], music: ["music"], sport_movement: ["active", "sports"], food_cooking: ["food"], games: ["games"],
    outdoors: ["outdoors"], learning: ["learning"], making_technology: ["learning", "creative"],
    film_storytelling: ["film", "conversation"], relaxing: ["low_energy"], community_culture: ["conversation"]
  };
  return Boolean(category && terms[category].some((term) => haystack.includes(term)));
}
