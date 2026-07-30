import { ApiError, authorizationError } from "./http";
import { authenticate, randomToken, secureCookieSuffix, sha256, slug } from "./auth";
import type { CradleEnv } from "./types";

export const IDENTITY_COOKIE = "cradle_identity";
export const IDENTITY_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export type AuthProvider = "google" | "apple" | "email";

type SupabaseUser = {
  id: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string };
  app_metadata?: { provider?: string };
  identities?: Array<{ provider?: string; id?: string }>;
};

function cookieValue(request: Request, name: string): string | null {
  const match = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? match[1] : null;
}

export function identityCookie(token: string, env: CradleEnv, maxAge = IDENTITY_SESSION_MAX_AGE): string {
  const secure = secureCookieSuffix(env);
  return `${IDENTITY_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function clearIdentityCookie(env: CradleEnv): string { return identityCookie("", env, 0); }

export async function createIdentitySession(db: D1Database, accountId: string): Promise<{ token: string; expiresAt: string }> {
  const token = randomToken(); const now = new Date();
  const expiresAt = new Date(now.getTime() + IDENTITY_SESSION_MAX_AGE * 1000).toISOString();
  await db.prepare(`INSERT INTO identity_sessions
    (id, account_id, token_hash, expires_at, created_at, updated_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), accountId, await sha256(token), expiresAt, now.toISOString(), now.toISOString(), now.toISOString()).run();
  return { token, expiresAt };
}

export async function authenticateIdentity(request: Request, db: D1Database): Promise<{ accountId: string; identitySessionId: string }> {
  const token = cookieValue(request, IDENTITY_COOKIE);
  if (!token) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Please sign in to continue.");
  const row = await db.prepare(`SELECT s.id AS identitySessionId, s.account_id AS accountId
    FROM identity_sessions s JOIN account_security a ON a.account_id = s.account_id
      JOIN user_accounts u ON u.id = s.account_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND a.account_status = 'active' AND u.is_active = 1
    LIMIT 1`).bind(await sha256(token), new Date().toISOString()).first<{ accountId: string; identitySessionId: string }>();
  if (!row) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "Please sign in to continue.");
  await db.prepare("UPDATE identity_sessions SET last_seen_at = ?, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), new Date().toISOString(), row.identitySessionId).run();
  return row;
}

export function providerFromSupabaseUser(user: SupabaseUser): AuthProvider {
  const provider = user.app_metadata?.provider || user.identities?.[0]?.provider;
  if (provider === "google" || provider === "apple") return provider;
  return "email";
}

export async function supabaseUser(accessToken: string, env: CradleEnv): Promise<SupabaseUser> {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new ApiError(503, "AUTH_PROVIDER_UNAVAILABLE", "Sign-in is not configured yet.");
  let response: Response;
  try {
    response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` }
    });
  } catch { throw new ApiError(503, "AUTH_PROVIDER_UNAVAILABLE", "Sign-in is temporarily unavailable."); }
  if (!response.ok) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "We could not verify that sign-in. Please try again.");
  const user = await response.json() as SupabaseUser;
  if (!user.id || user.id.length > 255) throw new ApiError(401, "AUTHENTICATION_REQUIRED", "We could not verify that sign-in. Please try again.");
  return user;
}

export async function recordAuthEvent(db: D1Database, event: {
  accountId?: string | null; householdId?: string | null; memberId?: string | null;
  eventName: string; provider?: string | null; result: "success" | "failure"; safeCode?: string | null; requestId?: string | null;
}): Promise<void> {
  try {
    await db.prepare(`INSERT INTO auth_events
      (id, account_id, household_id, member_id, event_name, provider, result, safe_code, request_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), event.accountId || null, event.householdId || null, event.memberId || null,
        event.eventName, event.provider || null, event.result, event.safeCode || null, event.requestId || null, new Date().toISOString()).run();
  } catch (error) { console.error("Could not record auth event", { error }); }
}

export async function requirePlatformOperator(db: D1Database, request: Request): Promise<{ accountId: string }> {
  let accountId: string;
  try { accountId = (await authenticateIdentity(request, db)).accountId; }
  catch { accountId = (await authenticate(request, db)).accountId || ""; }
  const operator = await db.prepare("SELECT account_id AS accountId FROM platform_operators WHERE account_id = ? AND status = 'active'")
    .bind(accountId).first<{ accountId: string }>();
  if (!operator) throw authorizationError("Platform operator access is required.");
  return operator;
}

export async function writePlatformAudit(db: D1Database, input: {
  operatorAccountId: string; targetAccountId?: string | null; action: string; result: "success" | "failure";
  reason?: string | null; requestId?: string | null;
}): Promise<void> {
  await db.prepare(`INSERT INTO platform_audit_log
    (id, operator_account_id, target_account_id, action, result, reason, request_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), input.operatorAccountId, input.targetAccountId || null, input.action.slice(0, 80), input.result,
      input.reason ? input.reason.trim().slice(0, 500) : null, input.requestId || null, new Date().toISOString()).run();
}

export function accountDisplayName(user: SupabaseUser): string {
  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "New family member";
  return name.trim().slice(0, 80) || "New family member";
}

export function providerIdentity(user: SupabaseUser): { provider: AuthProvider; subject: string; email: string | null } {
  return { provider: providerFromSupabaseUser(user), subject: user.id, email: user.email?.trim().slice(0, 255) || null };
}

export type ProviderIdentity = ReturnType<typeof providerIdentity>;

type ProviderAccount = { id: string; status: string };

export type ProviderAccountSync = {
  account: ProviderAccount;
  external: ProviderIdentity;
  profileCreated: boolean;
};

function isUniqueConstraint(error: unknown): boolean {
  const message = String(error).toLowerCase();
  return message.includes("unique constraint") || message.includes("constraint failed");
}

async function findProviderAccount(db: D1Database, external: ProviderIdentity): Promise<{ id: string; status: string; identityId: string } | null> {
  return db.prepare(`SELECT a.id, COALESCE(s.account_status, 'active') AS status, i.id AS identityId
    FROM auth_identities i JOIN user_accounts a ON a.id = i.account_id
    LEFT JOIN account_security s ON s.account_id = a.id
    WHERE i.provider = ? AND i.provider_subject = ? LIMIT 1`)
    .bind(external.provider, external.subject)
    .first<{ id: string; status: string; identityId: string }>();
}

/**
 * Synchronise a verified provider identity into Cradle's existing account
 * model. Provider subjects are the only stable lookup key; email is metadata,
 * never an implicit account-linking key.
 */
export async function synchroniseProviderAccount(db: D1Database, user: SupabaseUser): Promise<ProviderAccountSync> {
  const external = providerIdentity(user);
  const now = new Date().toISOString();
  let existing = await findProviderAccount(db, external);
  if (existing) {
    const displayName = accountDisplayName(user);
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO account_security (account_id, account_status, created_at, updated_at) VALUES (?, 'active', ?, ?)")
        .bind(existing.id, now, now),
      db.prepare("INSERT OR IGNORE INTO profiles (account_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(existing.id, displayName, now, now),
      db.prepare("INSERT OR IGNORE INTO profile_preferences (account_id, preferences_json, created_at, updated_at) VALUES (?, '{}', ?, ?)")
        .bind(existing.id, now, now),
      db.prepare("UPDATE auth_identities SET email = ?, last_seen_at = ? WHERE id = ?")
        .bind(external.email, now, existing.identityId)
    ]);
    return { account: { id: existing.id, status: existing.status }, external, profileCreated: false };
  }

  const accountId = crypto.randomUUID();
  const accountReference = `${slug(external.email?.split("@")[0] || "profile") || "profile"}-${crypto.randomUUID().slice(0, 8)}`;
  const profileName = accountDisplayName(user);
  const pinHash = randomToken();
  const pinSalt = randomToken(16);
  try {
    await db.batch([
      db.prepare(`INSERT INTO user_accounts
        (id, account_reference, display_name, pin_hash, pin_salt, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
        .bind(accountId, accountReference, profileName, pinHash, pinSalt, now, now),
      db.prepare("INSERT INTO account_security (account_id, account_status, created_at, updated_at) VALUES (?, 'active', ?, ?)")
        .bind(accountId, now, now),
      db.prepare("INSERT INTO profiles (account_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(accountId, profileName, now, now),
      db.prepare("INSERT INTO profile_preferences (account_id, preferences_json, created_at, updated_at) VALUES (?, '{}', ?, ?)")
        .bind(accountId, now, now),
      db.prepare(`INSERT INTO auth_identities
        (id, account_id, provider, provider_subject, email, created_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), accountId, external.provider, external.subject, external.email, now, now)
    ]);
    return { account: { id: accountId, status: "active" }, external, profileCreated: true };
  } catch (error) {
    // Two tabs may complete the same OAuth callback together. D1's unique
    // provider-subject index is authoritative; recover by loading that row
    // instead of creating a second Cradle account.
    if (!isUniqueConstraint(error)) throw error;
    existing = await findProviderAccount(db, external);
    if (!existing) throw error;
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO account_security (account_id, account_status, created_at, updated_at) VALUES (?, 'active', ?, ?)")
        .bind(existing.id, now, now),
      db.prepare("INSERT OR IGNORE INTO profiles (account_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)")
        .bind(existing.id, profileName, now, now),
      db.prepare("INSERT OR IGNORE INTO profile_preferences (account_id, preferences_json, created_at, updated_at) VALUES (?, '{}', ?, ?)")
        .bind(existing.id, now, now),
      db.prepare("UPDATE auth_identities SET email = ?, last_seen_at = ? WHERE id = ?")
        .bind(external.email, now, existing.identityId)
    ]);
    return { account: { id: existing.id, status: existing.status }, external, profileCreated: false };
  }
}
