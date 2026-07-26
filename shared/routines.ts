import type { PetType } from "./pets";

export const ROUTINE_TEMPLATE_VERSION = 1;

export const ROOM_TYPES = [
  { value: "kitchen", label: "Kitchen" },
  { value: "bathroom", label: "Bathroom" },
  { value: "toilet", label: "Toilet / WC" },
  { value: "living_room", label: "Living room" },
  { value: "bedroom", label: "Bedroom" },
  { value: "child_bedroom", label: "Child bedroom" },
  { value: "hallway", label: "Hallway / entrance" },
  { value: "laundry", label: "Laundry / utility" },
  { value: "dining_room", label: "Dining room" },
  { value: "home_office", label: "Home office" },
  { value: "garden", label: "Garden / outdoor space" },
  { value: "other", label: "Other room" }
] as const;
export type RoomType = typeof ROOM_TYPES[number]["value"];

export const ROUTINE_FREQUENCIES = [
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekends", label: "Weekends" },
  { value: "twice_weekly", label: "Twice a week" },
  { value: "three_weekly", label: "Three times a week" },
  { value: "weekly", label: "Once a week" },
  { value: "fortnightly", label: "Every two weeks" },
  { value: "monthly", label: "Once a month" },
  { value: "as_needed", label: "When needed" },
  { value: "custom", label: "Custom" }
] as const;
export type RoutineFrequency = typeof ROUTINE_FREQUENCIES[number]["value"];

export type RoutineTemplate = {
  key: string;
  version: number;
  context: "room" | "pet";
  roomTypes?: readonly RoomType[];
  petTypes?: readonly PetType[];
  name: string;
  purpose: string;
  steps: readonly string[];
  definitionOfDone: string;
  defaultFrequency: RoutineFrequency;
  estimatedMinutes: number;
  defaultEnabled: boolean;
  defaultAssignment: "rotate" | "assigned";
};

export const defaultRoutineAssignment = (key: string): "rotate" | "assigned" =>
  /(^|\.)(medication|baby_care|school_pickup)(\.|$)/.test(key) ? "assigned" : "rotate";

const room = (
  key: string, roomTypes: readonly RoomType[], name: string, steps: readonly string[],
  defaultFrequency: RoutineFrequency, estimatedMinutes: number, defaultEnabled = true
): RoutineTemplate => ({
  key, version: ROUTINE_TEMPLATE_VERSION, context: "room", roomTypes, name,
  purpose: `Keep this ${ROOM_TYPES.find(({ value }) => roomTypes.includes(value))?.label.toLowerCase() || "room"} comfortable and ready to use.`,
  steps, definitionOfDone: `${name} is finished and the room is ready to use.`,
  defaultFrequency, estimatedMinutes, defaultEnabled, defaultAssignment: defaultRoutineAssignment(key)
});

const pet = (
  key: string, petTypes: readonly PetType[], name: string, steps: readonly string[],
  defaultFrequency: RoutineFrequency, estimatedMinutes: number, defaultEnabled = true
): RoutineTemplate => ({
  key, version: ROUTINE_TEMPLATE_VERSION, context: "pet", petTypes, name,
  purpose: `Provide consistent everyday care for {pet}.`, steps,
  definitionOfDone: `${name.replace("{pet}", "The pet")} is complete.`,
  defaultFrequency, estimatedMinutes, defaultEnabled, defaultAssignment: defaultRoutineAssignment(key)
});

export const ROUTINE_TEMPLATES: readonly RoutineTemplate[] = [
  room("kitchen.evening_reset", ["kitchen"], "Evening kitchen reset",
    ["Clear the table", "Wash or load dishes", "Wipe worktops", "Sweep high-use areas", "Check bins"], "daily", 20),
  room("kitchen.weekly_clean", ["kitchen"], "Weekly kitchen clean",
    ["Clean fridge shelves", "Mop the floor", "Check food dates", "Deep-clean the sink and hob"], "weekly", 35),
  room("kitchen.fridge_check", ["kitchen"], "Fridge check",
    ["Remove expired food", "Group food so it is visible", "Wipe spills", "Note anything running low"], "weekly", 15, false),
  room("bathroom.daily_reset", ["bathroom"], "Bathroom reset",
    ["Wipe the sink", "Check the toilet", "Replace wet towels", "Clear surfaces"], "daily", 10),
  room("bathroom.weekly_clean", ["bathroom"], "Weekly bathroom clean",
    ["Clean bath or shower", "Clean toilet thoroughly", "Mop floor", "Replace towels", "Restock toiletries"], "weekly", 30),
  room("toilet.daily_reset", ["toilet"], "Toilet reset",
    ["Wipe sink", "Clean toilet", "Check toilet roll", "Empty bin if needed"], "daily", 10),
  room("toilet.weekly_clean", ["toilet"], "Weekly toilet clean",
    ["Mop floor", "Clean fixtures", "Restock supplies"], "weekly", 20),
  room("living_room.weekly_reset", ["living_room"], "Living room reset",
    ["Tidy surfaces", "Vacuum or sweep", "Reset cushions", "Remove cups and rubbish", "Dust main surfaces"], "weekly", 25),
  room("bedroom.weekly_clean", ["bedroom"], "Bedroom clean",
    ["Tidy the room", "Vacuum or sweep", "Change bedding", "Put clothes away", "Empty bin"], "weekly", 30),
  room("child_bedroom.weekly_reset", ["child_bedroom"], "Bedroom reset",
    ["Tidy floor", "Put belongings away", "Change bedding", "Check laundry", "Reset school bag if needed"], "weekly", 25),
  room("hallway.regular_reset", ["hallway"], "Entrance reset",
    ["Clear shoes and bags", "Sweep or vacuum", "Sort post", "Reset the entrance area"], "three_weekly", 15),
  room("laundry.rotation", ["laundry"], "Laundry rotation",
    ["Run a laundry load", "Dry clothes", "Fold clothes", "Put clothes away", "Clean lint filter"], "as_needed", 30),
  room("laundry.supplies", ["laundry"], "Check laundry supplies", ["Check detergent", "Check stain treatment", "Restock if needed"], "monthly", 10, false),
  room("dining_room.after_use", ["dining_room"], "Dining area reset",
    ["Clear table", "Wipe table", "Sweep floor", "Reset dining area"], "daily", 15),
  room("home_office.weekly_reset", ["home_office"], "Home office reset",
    ["Clear desk", "File papers", "Empty bin", "Dust equipment", "Check cables"], "weekly", 20),
  room("garden.weekly_care", ["garden"], "Outdoor space check",
    ["Clear rubbish", "Water plants if needed", "Sweep the area", "Check outdoor items"], "weekly", 25),
  room("other.weekly_reset", ["other"], "Weekly room reset",
    ["Tidy surfaces", "Sweep or vacuum", "Empty bin"], "weekly", 20, false),

  pet("pet.cat.morning_feed", ["cat"], "Morning feed for {pet}", ["Wash the bowl if needed", "Add the usual food", "Check fresh water"], "daily", 10),
  pet("pet.cat.evening_feed", ["cat"], "Evening feed for {pet}", ["Wash the bowl if needed", "Add the usual food", "Check fresh water"], "daily", 10),
  pet("pet.cat.refresh_water", ["cat"], "Refresh {pet}’s water", ["Empty old water", "Rinse the bowl", "Add fresh water"], "daily", 5),
  pet("pet.cat.clean_litter", ["cat"], "Clean {pet}’s litter tray", ["Remove waste", "Top up litter if needed", "Clean the surrounding area"], "daily", 10),
  pet("pet.cat.grooming", ["cat"], "Groom {pet}", ["Brush coat gently", "Check for anything unusual"], "weekly", 15, false),
  pet("pet.cat.supplies", ["cat"], "Check food and litter supplies", ["Check food", "Check litter", "Add anything low to the household list"], "weekly", 10, false),

  pet("pet.dog.morning_feed", ["dog"], "Morning feed for {pet}", ["Clean the bowl", "Add the usual food", "Refresh water"], "daily", 10),
  pet("pet.dog.evening_feed", ["dog"], "Evening feed for {pet}", ["Clean the bowl", "Add the usual food", "Refresh water"], "daily", 10),
  pet("pet.dog.refresh_water", ["dog"], "Refresh {pet}’s water", ["Empty old water", "Rinse the bowl", "Add fresh water"], "daily", 5),
  pet("pet.dog.morning_walk", ["dog"], "Morning walk with {pet}", ["Prepare lead and bags", "Take the usual safe route", "Return equipment"], "daily", 30),
  pet("pet.dog.evening_walk", ["dog"], "Evening walk with {pet}", ["Prepare lead and bags", "Take the usual safe route", "Return equipment"], "daily", 30),
  pet("pet.dog.clean_bowls", ["dog"], "Clean {pet}’s bowls", ["Wash food bowl", "Wash water bowl", "Return clean bowls"], "weekly", 10),
  pet("pet.dog.grooming", ["dog"], "Groom {pet}", ["Brush coat gently", "Check paws and coat"], "weekly", 20, false),
  pet("pet.dog.supplies", ["dog"], "Check dog-care supplies", ["Check food", "Check waste bags", "Note anything running low"], "weekly", 10, false),

  pet("pet.fish.feed", ["fish"], "Feed {pet}", ["Add the usual amount of food", "Remove obvious uneaten food if needed"], "daily", 5),
  pet("pet.fish.check_water", ["fish"], "Check {pet}’s water", ["Look for changes in water clarity", "Check equipment is running"], "daily", 5),
  pet("pet.fish.clean_tank", ["fish"], "Clean {pet}’s tank", ["Follow the household tank-care routine", "Clean accessible surfaces", "Return equipment"], "fortnightly", 30, false),
  pet("pet.fish.check_filter", ["fish"], "Check tank filter", ["Check flow", "Clean or replace household-approved parts if due"], "weekly", 10, false),
  pet("pet.fish.supplies", ["fish"], "Check fish-care supplies", ["Check food", "Check water-care supplies", "Note anything running low"], "monthly", 10, false),

  pet("pet.bird.feed", ["bird"], "Feed {pet}", ["Clean food dish if needed", "Add the usual food"], "daily", 10),
  pet("pet.bird.refresh_water", ["bird"], "Refresh {pet}’s water", ["Empty old water", "Clean the container", "Add fresh water"], "daily", 5),
  pet("pet.bird.clean_cage", ["bird"], "Clean {pet}’s cage", ["Remove waste", "Clean safe surfaces", "Replace liner or bedding"], "weekly", 25),
  pet("pet.bird.enrichment", ["bird"], "Time with {pet}", ["Prepare a safe activity", "Spend social or enrichment time together"], "daily", 15, false),

  pet("pet.small.feed", ["rabbit", "guinea_pig", "hamster"], "Feed {pet}", ["Clean food area", "Add the usual food", "Check hay or forage if used"], "daily", 10),
  pet("pet.small.refresh_water", ["rabbit", "guinea_pig", "hamster"], "Refresh {pet}’s water", ["Empty old water", "Clean the container", "Add fresh water"], "daily", 5),
  pet("pet.small.clean_area", ["rabbit", "guinea_pig", "hamster"], "Clean {pet}’s living area", ["Remove waste", "Clean safe surfaces", "Replace bedding if needed"], "weekly", 30),
  pet("pet.small.enrichment", ["rabbit", "guinea_pig", "hamster"], "Enrichment for {pet}", ["Check safe toys or activities", "Spend supervised enrichment time"], "daily", 15, false),

  pet("pet.reptile.feed", ["reptile", "tortoise"], "Feed {pet}", ["Prepare the usual food", "Remove old food if needed"], "daily", 10),
  pet("pet.reptile.refresh_water", ["reptile", "tortoise"], "Refresh {pet}’s water", ["Clean the water container", "Add fresh water"], "daily", 5),
  pet("pet.reptile.habitat_check", ["reptile", "tortoise"], "Check {pet}’s habitat", ["Check heat and lighting", "Inspect the habitat", "Clean obvious waste"], "daily", 10),
  pet("pet.reptile.clean_enclosure", ["reptile", "tortoise"], "Clean {pet}’s enclosure", ["Move the pet safely using the household routine", "Clean the enclosure", "Restore the habitat"], "weekly", 30, false),

  pet("pet.other.feed", ["horse", "chicken", "other"], "Feed {pet}", ["Prepare the usual food", "Check the feeding area"], "daily", 15),
  pet("pet.other.refresh_water", ["horse", "chicken", "other"], "Refresh {pet}’s water", ["Clean the water container", "Add fresh water"], "daily", 10),
  pet("pet.other.clean_area", ["horse", "chicken", "other"], "Clean {pet}’s living area", ["Remove waste", "Clean the regular living area", "Restore bedding if used"], "weekly", 30)
];

export const isRoomType = (value: unknown): value is RoomType =>
  typeof value === "string" && ROOM_TYPES.some((item) => item.value === value);
export const isRoutineFrequency = (value: unknown): value is RoutineFrequency =>
  typeof value === "string" && ROUTINE_FREQUENCIES.some((item) => item.value === value);
export function inferRoomType(name: string): RoomType {
  const value = name.trim().toLowerCase();
  if (/\bkitchen\b/.test(value)) return "kitchen";
  if (/\bbath(room)?\b/.test(value)) return "bathroom";
  if (/\b(toilet|wc|loo)\b/.test(value)) return "toilet";
  if (/\b(living|lounge|family room)\b/.test(value)) return "living_room";
  if (/\b(nursery|child|kid|playroom)\b/.test(value)) return "child_bedroom";
  if (/\bbed(room)?\b/.test(value)) return "bedroom";
  if (/\b(hall|hallway|entrance|entry)\b/.test(value)) return "hallway";
  if (/\b(laundry|utility)\b/.test(value)) return "laundry";
  if (/\bdining\b/.test(value)) return "dining_room";
  if (/\b(office|study)\b/.test(value)) return "home_office";
  if (/\b(garden|yard|patio|balcony|outdoor)\b/.test(value)) return "garden";
  return "other";
}

export const templatesForRoom = (roomType: RoomType): readonly RoutineTemplate[] =>
  ROUTINE_TEMPLATES.filter((template) => template.context === "room" && template.roomTypes?.includes(roomType));
export const templatesForPet = (petType: PetType): readonly RoutineTemplate[] =>
  ROUTINE_TEMPLATES.filter((template) => template.context === "pet" && template.petTypes?.includes(petType));
export const routineTemplate = (key: string): RoutineTemplate | undefined =>
  ROUTINE_TEMPLATES.find((template) => template.key === key);
export const displayRoutineName = (template: RoutineTemplate, petName?: string): string =>
  template.name.replace("{pet}", petName || "your pet");
export const frequencyLabel = (value: RoutineFrequency): string =>
  ROUTINE_FREQUENCIES.find((frequency) => frequency.value === value)?.label || value;
