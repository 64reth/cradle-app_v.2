import type { CradleIconName } from "./components/ui/CradleIcon";

const normalise = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[’']/g, "'");

const ROOM_ALIASES: Array<[RegExp, CradleIconName]> = [
  [/kitchen|cooking/, "kitchen"], [/bath(room)?|shower/, "bathroom"], [/child(ren)?('s)? room/, "bedroom"],
  [/bed(room)?|master room|parent(s)? room/, "bedroom"], [/living|lounge|family room/, "livingRoom"],
  [/dining|eat(ing)? room/, "diningRoom"], [/hall|entrance|foyer|entry/, "hallway"],
  [/office|study|desk/, "office"], [/utility|laundry|wash/, "utility"], [/garden|outdoor|yard|patio/, "garden"],
  [/garage|car port|carport/, "garage"], [/playroom|play room|toy/, "playroom"]
];

export function getRoomIconName(roomTypeOrName: unknown): CradleIconName {
  const value = normalise(roomTypeOrName);
  for (const [pattern, icon] of ROOM_ALIASES) if (pattern.test(value)) return icon;
  return value === "bedroom" ? "bedroom" : value === "bathroom" ? "bathroom" : "room";
}

const TASK_MAPPINGS: Array<[RegExp, CradleIconName]> = [
  [/laundry|wash(ing)? clothes|clothes hamper/, "laundry"], [/dish(es)?|dishwasher|plate(s)?/, "dishes"],
  [/vacuum|hoover/, "vacuum"], [/sweep|mop|floor|clean|dust|scrub/, "cleaning"],
  [/rubbish|trash|bin(s)?|waste/, "rubbish"], [/recycl/, "recycling"], [/cook|meal|dinner|breakfast|food prep/, "cooking"],
  [/shop|grocer|supplies/, "shopping"], [/water(ing)?|plant care/, "watering"], [/plant(s)?/, "plants"],
  [/pet|feed|walk.*dog|litter|enclosure|animal/, "petCare"], [/bed|bedding|bedroom/, "bed"],
  [/toilet|loo/, "toilet"], [/bath/, "bath"], [/shower/, "shower"]
];

export function getTaskIconName(categoryOrName: unknown): CradleIconName {
  const value = normalise(categoryOrName);
  for (const [pattern, icon] of TASK_MAPPINGS) if (pattern.test(value)) return icon;
  return "mission";
}
