import { describe, expect, it } from "vitest";
import { PET_TYPES, PET_TYPE_VALUES, isPetType } from "../shared/pets";

describe("Pet types", () => {
  it("is the typed single source for values and friendly labels", () => {
    expect(PET_TYPES).toEqual([
      { value: "dog", label: "Dog" }, { value: "cat", label: "Cat" }, { value: "fish", label: "Fish" },
      { value: "bird", label: "Bird" }, { value: "rabbit", label: "Rabbit" }, { value: "hamster", label: "Hamster" },
      { value: "guinea_pig", label: "Guinea Pig" }, { value: "reptile", label: "Reptile" },
      { value: "tortoise", label: "Tortoise" }, { value: "horse", label: "Horse" },
      { value: "chicken", label: "Chicken" }, { value: "other", label: "Other" }
    ]);
    expect(PET_TYPE_VALUES).toEqual(PET_TYPES.map(({ value }) => value));
  });
  it("accepts every supported type and rejects unsupported values", () => {
    PET_TYPE_VALUES.forEach((value) => expect(isPetType(value)).toBe(true));
    expect(isPetType("dragon")).toBe(false);
    expect(isPetType("")).toBe(false);
  });
});
