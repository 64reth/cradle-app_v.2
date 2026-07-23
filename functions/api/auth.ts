import { ApiError, authorizationError, validationError } from "./http";
import type { CradleEnv, JsonRecord } from "./types";

export const SESSION_COOKIE = "cradle_session";
export const PIN_ITERATIONS = 210_000;
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

export type Role = "owner" | "parent_admin" | "adult" | "child";
export type Identity = {
  sessionId: string;
  householdId: string;
  householdName: string;
  householdReference: string;
  memberId: string;
  displayName: string;
  profileReference: string;
  role: Role;
  expiresAt: string;
  setupStatus: "incomplete" | "complete";
  setupStep: "leadership" | "members" | "rooms" | "pets" | "companion" | "review" | "complete";
};

function bytes(length: number): Uint8Array {
  const value = new Uint8Array(length);
  crypto.getRandomValues(value);
  return value;
}

function hex(value: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(value)).map((item) => item.toString(16).padStart(2, "0")).join("");
}

export function randomToken(size = 32): string {
  return hex(bytes(size));
}

export async function sha256(value: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

export async function hashPin(pin: string, salt = randomToken(16)): Promise<{ hash: string; salt: string }> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: PIN_ITERATIONS },
    key,
    256
  );
  return { hash: hex(result), salt };
}

export async function verifyPin(pin: string, salt: string, expected: string): Promise<boolean> {
  const actual = (await hashPin(pin, salt)).hash;
  if (actual.length !== expected.length) return false;
  let mismatch = 0;
  for (let index = 0; index < actual.length; index += 1) mismatch |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  return mismatch === 0;
}

export function slug(value: string): string {
  return value.trim().toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export function textField(body: JsonRecord, field: string, min: number, max: number): string {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw validationError("Please check the submitted fields.", { [field]: `Must be ${min}-${max} characters` });
  }
  return value.trim();
}

export function pinField(body: JsonRecord): string {
  const pin = textField(body, "pin", 4, 12);
  if (!/^\d+$/.test(pin)) throw validationError("Please check the submitted fields.", { pin: "Use 4-12 digits" });
  return pin;
}

export function cookie(token: string, env: CradleEnv, maxAge = SESSION_MAX_AGE): string {
  const secure = env.APP_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function clearCookie(env: CradleEnv): string {
  return cookie("", env, 0);
}

function cookieValue(request: Request): string | null {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]*)`));
  return match ? match[1] : null;
}

export async function createSession(db: D1Database, householdId: string, memberId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE * 1000).toISOString();
  await db.prepare(
    "INSERT INTO sessions (id, household_id, member_id, token_hash, expires_at, created_at, updated_at, revoked_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)"
  ).bind(crypto.randomUUID(), householdId, memberId, tokenHash, expiresAt, now.toISOString(), now.toISOString()).run();
  return { token, expiresAt };
}

export async function authenticate(request: Request, db: D1Database): Promise<Identity> {
  const token = cookieValue(request);
  if (!token) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Please sign in to continue.");
  const tokenHash = await sha256(token);
  const row = await db.prepare(`
    SELECT s.id AS sessionId, s.household_id AS householdId, s.member_id AS memberId,
      s.expires_at AS expiresAt, h.name AS householdName, h.lookup_reference AS householdReference,
      m.display_name AS displayName, m.profile_reference AS profileReference, m.role AS role,
      h.setup_status AS setupStatus, h.setup_step AS setupStep
    FROM sessions s
    JOIN households h ON h.id = s.household_id
    JOIN members m ON m.household_id = s.household_id AND m.id = s.member_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
      AND m.is_active = 1
    LIMIT 1
  `).bind(tokenHash, new Date().toISOString()).first<Identity>();
  if (!row) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Please sign in to continue.");
  return row;
}

export function requireInvitationPermission(identity: Identity): void {
  if (identity.role !== "owner" && identity.role !== "parent_admin") throw authorizationError();
}

export function invitedRole(body: JsonRecord): Exclude<Role, "owner"> {
  const role = body.role;
  if (role !== "parent_admin" && role !== "adult" && role !== "child") {
    throw validationError("Please check the submitted fields.", { role: "Choose parent_admin, adult, or child" });
  }
  return role;
}

export function throttleKey(request: Request, household: string, member: string): Promise<string> {
  const address = request.headers.get("CF-Connecting-IP") || "local";
  return sha256(`${address}|${household.toLowerCase()}|${member.toLowerCase()}`);
}

export async function checkThrottle(db: D1Database, key: string): Promise<void> {
  const row = await db.prepare("SELECT blocked_until AS blockedUntil FROM authentication_attempts WHERE throttle_key = ?").bind(key).first<{ blockedUntil: string | null }>();
  if (row?.blockedUntil && row.blockedUntil > new Date().toISOString()) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", "Sign-in is temporarily unavailable. Please try again later.");
  }
}

export async function recordFailure(db: D1Database, key: string): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - 15 * 60_000).toISOString();
  const blocked = new Date(now.getTime() + 15 * 60_000).toISOString();
  await db.prepare(`
    INSERT INTO authentication_attempts (throttle_key, failure_count, window_started_at, blocked_until, updated_at)
    VALUES (?, 1, ?, NULL, ?)
    ON CONFLICT(throttle_key) DO UPDATE SET
      failure_count = CASE WHEN window_started_at < ? THEN 1 ELSE failure_count + 1 END,
      window_started_at = CASE WHEN window_started_at < ? THEN excluded.window_started_at ELSE window_started_at END,
      blocked_until = CASE WHEN (CASE WHEN window_started_at < ? THEN 1 ELSE failure_count + 1 END) >= 5 THEN ? ELSE NULL END,
      updated_at = excluded.updated_at
  `).bind(key, now.toISOString(), now.toISOString(), windowStart, windowStart, windowStart, blocked).run();
}

export async function clearFailures(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM authentication_attempts WHERE throttle_key = ?").bind(key).run();
}
