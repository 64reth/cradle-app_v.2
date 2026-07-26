import { describe, expect, it } from "vitest";
import { INTEREST_CATEGORY_LABELS, SUGGESTED_INTERESTS } from "../shared/interests";
import { parseInterestInput } from "../functions/api/interests";

describe("Hobbies and Interests", () => {
  it("keeps optional details optional and trims custom names", () => {
    const interest = parseInterestInput({ name: "  Model building  " });
    expect(interest.name).toBe("Model building");
    expect(interest.category).toBeNull();
    expect(interest.level).toBeNull();
    expect(interest.active).toBe(true);
  });

  it("provides a compact, labelled suggestion set", () => {
    expect(SUGGESTED_INTERESTS.some(({ name }) => name === "Music")).toBe(true);
    expect(INTEREST_CATEGORY_LABELS.making_technology).toBe("Making and technology");
  });

  it("rejects unsupported categories and excessive notes", () => {
    expect(() => parseInterestInput({ name: "Music", category: "unknown" })).toThrow();
    expect(() => parseInterestInput({ name: "Music", note: "x".repeat(501) })).toThrow();
  });
});
