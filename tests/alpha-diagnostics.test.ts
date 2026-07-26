import { describe, expect, it } from "vitest";
import { parseAlphaDiagnosticEvent, parseAlphaFeedback } from "../shared/alpha-diagnostics";

describe("alpha diagnostics privacy boundary", () => {
  it("accepts only the typed event fields and drops household content", () => {
    const event = parseAlphaDiagnosticEvent({
      name: "api_error", screen: "dashboard", action: "sign_off", statusCode: 409,
      message: "private task description", mealContents: "secret recipe", durationMs: 12.4
    });
    expect(event).toEqual({ name: "api_error", screen: "dashboard", action: "sign_off", statusCode: 409, durationMs: 12 });
    expect(event).not.toHaveProperty("message");
    expect(event).not.toHaveProperty("mealContents");
  });

  it("rejects unsupported events and unsafe feedback values", () => {
    expect(parseAlphaDiagnosticEvent({ name: "keystroke", value: "secret" })).toBeNull();
    expect(parseAlphaFeedback({ category: "bug", message: "x".repeat(2001) })).toBeNull();
    expect(parseAlphaFeedback({ category: "bug", rating: 6 })).toBeNull();
  });

  it("allows concise explicit feedback without optional details", () => {
    expect(parseAlphaFeedback({ category: "delight" })).toEqual({ category: "delight" });
  });
});
