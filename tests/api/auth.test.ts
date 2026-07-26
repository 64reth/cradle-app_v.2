import { describe, expect, it } from "vitest";
import {
  PIN_ITERATIONS, SESSION_COOKIE, checkThrottle, clearCookie, cookie, hashPin,
  invitedRole, randomToken, requireInvitationPermission, sha256, slug, verifyPin
} from "../../functions/api/auth";

describe("authentication primitives", () => {
  it("uses a centrally defined high PBKDF2 work factor", () => expect(PIN_ITERATIONS).toBe(210_000));

  it("salts and hashes a PIN without retaining plaintext", async () => {
    const first = await hashPin("4829");
    const second = await hashPin("4829");
    expect(first.hash).not.toContain("4829");
    expect(first.hash).not.toBe(second.hash);
    expect(first.salt).not.toBe(second.salt);
    expect(await verifyPin("4829", first.salt, first.hash)).toBe(true);
    expect(await verifyPin("0000", first.salt, first.hash)).toBe(false);
  });

  it("generates random bearer values and deterministic hashes", async () => {
    const one = randomToken();
    expect(one).toHaveLength(64);
    expect(randomToken()).not.toBe(one);
    expect(await sha256(one)).toBe(await sha256(one));
    expect(await sha256(one)).not.toBe(one);
  });

  it("sets hardened production cookies", () => {
    const value = cookie("secret", { APP_ENV: "production" });
    expect(value).toContain(`${SESSION_COOKIE}=secret`);
    expect(value).toContain("HttpOnly");
    expect(value).toContain("SameSite=Lax");
    expect(value).toContain("Path=/");
    expect(value).toContain("Max-Age=");
    expect(value).toContain("Secure");
  });

  it("allows a non-Secure cookie only for local HTTP development", () => {
    expect(cookie("secret", { APP_ENV: "development" })).not.toContain("; Secure");
    expect(clearCookie({ APP_ENV: "development" })).toContain("Max-Age=0");
  });

  it("keeps Secure cookies enabled in the Alpha runtime", () => {
    expect(cookie("secret", { APP_ENV: "alpha" })).toContain("; Secure");
    expect(clearCookie({ APP_ENV: "alpha" })).toContain("; Secure");
  });

  it("centralises invitation role policy", () => {
    expect(() => requireInvitationPermission({ role: "adult" } as never)).toThrow(/allowed/);
    expect(() => requireInvitationPermission({ role: "child" } as never)).toThrow(/allowed/);
    expect(() => requireInvitationPermission({ role: "owner" } as never)).not.toThrow();
    expect(invitedRole({ role: "parent_admin" })).toBe("parent_admin");
    expect(() => invitedRole({ role: "owner" })).toThrow(/fields/);
  });

  it("creates safe lookup slugs", () => expect(slug("  The Café Home! ")).toBe("the-cafe-home"));

  it("fails closed when a throttle row is blocked", async () => {
    const db = { prepare: () => ({ bind: () => ({ first: async () => ({ blockedUntil: "2999-01-01T00:00:00Z" }) }) }) } as unknown as D1Database;
    await expect(checkThrottle(db, "key")).rejects.toMatchObject({ status: 429, code: "TOO_MANY_ATTEMPTS" });
  });
});
