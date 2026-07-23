export const PET_TYPES = [
  { value: "dog", label: "Dog" },
  { value: "cat", label: "Cat" },
  { value: "fish", label: "Fish" },
  { value: "bird", label: "Bird" },
  { value: "rabbit", label: "Rabbit" },
  { value: "hamster", label: "Hamster" },
  { value: "guinea_pig", label: "Guinea Pig" },
  { value: "reptile", label: "Reptile" },
  { value: "tortoise", label: "Tortoise" },
  { value: "horse", label: "Horse" },
  { value: "chicken", label: "Chicken" },
  { value: "other", label: "Other" }
] as const;

export type PetType = typeof PET_TYPES[number]["value"];
export const PET_TYPE_VALUES = PET_TYPES.map(({ value }) => value) as readonly PetType[];

export function isPetType(value: unknown): value is PetType {
  return typeof value === "string" && PET_TYPE_VALUES.includes(value as PetType);
}
