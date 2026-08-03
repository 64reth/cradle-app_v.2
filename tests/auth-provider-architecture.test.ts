import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("shared authentication provider ownership", () => {
  it("routes public sign-in, household creation and invitation acceptance through one provider panel and registry", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    const invitation = readFileSync("src/Invitation.tsx", "utf8");
    const panel = readFileSync("src/SupabaseAuthActions.tsx", "utf8");
    expect(app).toContain("<SupabaseAuthActions");
    expect(invitation).toContain("<SupabaseAuthActions");
    expect(panel).toContain('from "./authProviders"');
    expect(app).not.toMatch(/VITE_AUTH_(GOOGLE|APPLE|EMAIL)_ENABLED/);
    expect(invitation).not.toMatch(/VITE_AUTH_(GOOGLE|APPLE|EMAIL)_ENABLED/);
  });

  it("never constructs a provider error endpoint or enables Apple implicitly", () => {
    const auth = readFileSync("src/supabaseAuth.ts", "utf8");
    const registry = readFileSync("src/authProviders.ts", "utf8");
    expect(auth).toContain("navigate(data.url)");
    expect(auth).not.toMatch(/navigate\(`|navigate\("|navigate\('/);
    expect(registry).toContain('VITE_AUTH_APPLE_ENABLED');
    expect(registry).toContain('value === "true"');
  });
});
