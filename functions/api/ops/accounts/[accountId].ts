import { requirePlatformOperator, writePlatformAudit } from "../../auth-provider";
import { handleApiRequest, methodNotAllowed, notFoundError, parseJsonBody, requireD1, success, validationError } from "../../http";
import type { CradleEnv } from "../../types";

type Context = { request: Request; env: CradleEnv; params: { accountId: string } };
const actions = ["revoke_sessions", "suspend", "restore", "resend_invitation", "resend_verification"] as const;

async function accountDetails(db: D1Database, accountId: string) {
  const account = await db.prepare(`SELECT a.id, a.account_reference AS accountReference, a.display_name AS displayName,
    s.account_status AS status, s.mfa_enabled AS mfaEnabled, a.created_at AS createdAt FROM user_accounts a
    JOIN account_security s ON s.account_id = a.id WHERE a.id = ?`).bind(accountId).first();
  if (!account) throw notFoundError("Account not found.");
  const [providers, memberships, sessions, authEvents, diagnostics] = await Promise.all([
    db.prepare(`SELECT provider, email, created_at AS createdAt, last_seen_at AS lastSeenAt FROM auth_identities WHERE account_id = ? ORDER BY provider`).bind(accountId).all(),
    db.prepare(`SELECT m.household_id AS householdId, h.name AS householdName, m.role, m.access_level AS accessLevel,
      m.lifecycle_state AS lifecycleState, m.is_active AS isActive FROM members m JOIN households h ON h.id = m.household_id
      WHERE m.account_id = ? ORDER BY h.name`).bind(accountId).all(),
    db.prepare(`SELECT s.id, m.auth_method AS authMethod, m.device_label AS deviceLabel, s.created_at AS createdAt,
      m.last_seen_at AS lastSeenAt, s.expires_at AS expiresAt FROM sessions s LEFT JOIN session_metadata m
      ON m.household_id = s.household_id AND m.session_id = s.id WHERE s.account_id = ? AND s.revoked_at IS NULL ORDER BY m.last_seen_at DESC`).bind(accountId).all(),
    db.prepare(`SELECT event_name AS name, provider, result, safe_code AS safeCode, created_at AS createdAt
      FROM auth_events WHERE account_id = ? ORDER BY created_at DESC LIMIT 100`).bind(accountId).all(),
    db.prepare(`SELECT (SELECT count(*) FROM alpha_diagnostic_events e JOIN members m ON m.household_id = e.household_id AND m.id = e.member_id WHERE m.account_id = ?) AS eventCount,
      (SELECT count(*) FROM alpha_feedback f WHERE f.member_id IN (SELECT id FROM members WHERE account_id = ?)) AS feedbackCount`).bind(accountId, accountId).first()
  ]);
  return { account, providers: providers.results, memberships: memberships.results, sessions: sessions.results,
    authenticationEvents: authEvents.results, diagnosticsSummary: diagnostics };
}

export async function onRequestGet({ request, env, params }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); await requirePlatformOperator(db, request);
    return success(await accountDetails(db, params.accountId), requestId);
  });
}

export async function onRequestPost({ request, env, params }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); const operator = await requirePlatformOperator(db, request);
    const body = await parseJsonBody(request); const action = body.action;
    if (typeof action !== "string" || !(actions as readonly string[]).includes(action)) throw validationError("Choose a supported operations action.");
    const target = await db.prepare("SELECT a.id, s.account_status AS status FROM user_accounts a JOIN account_security s ON s.account_id = a.id WHERE a.id = ?").bind(params.accountId).first<{ id: string; status: string }>();
    if (!target) {
      await writePlatformAudit(db, { operatorAccountId: operator.accountId, targetAccountId: null,
        action, result: "failure", reason: "Account not found.", requestId });
      throw notFoundError("Account not found.");
    }
    let result: "success" | "failure" = "success"; let reason = "";
    try {
      if (action === "revoke_sessions") {
        const now = new Date().toISOString();
        await db.batch([
          db.prepare("UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE account_id = ? AND revoked_at IS NULL").bind(now, now, params.accountId),
          db.prepare("UPDATE identity_sessions SET revoked_at = ?, updated_at = ? WHERE account_id = ? AND revoked_at IS NULL").bind(now, now, params.accountId)
        ]);
      } else if (action === "suspend") {
        await db.prepare("UPDATE account_security SET account_status = 'suspended', updated_at = ? WHERE account_id = ?").bind(new Date().toISOString(), params.accountId).run();
        await db.prepare("UPDATE user_accounts SET is_active = 0, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), params.accountId).run();
        const now = new Date().toISOString();
        await db.batch([
          db.prepare("UPDATE sessions SET revoked_at = ?, updated_at = ? WHERE account_id = ? AND revoked_at IS NULL").bind(now, now, params.accountId),
          db.prepare("UPDATE identity_sessions SET revoked_at = ?, updated_at = ? WHERE account_id = ? AND revoked_at IS NULL").bind(now, now, params.accountId)
        ]);
      } else if (action === "restore") {
        await db.prepare("UPDATE account_security SET account_status = 'active', updated_at = ? WHERE account_id = ?").bind(new Date().toISOString(), params.accountId).run();
        await db.prepare("UPDATE user_accounts SET is_active = 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), params.accountId).run();
      } else {
        if (action === "resend_verification") {
          const emailRow = await db.prepare("SELECT email FROM auth_identities WHERE account_id = ? AND provider = 'email' LIMIT 1")
            .bind(params.accountId).first<{ email: string | null }>();
          if (!emailRow?.email || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
            reason = "Provider verification delivery is not configured for this account."; result = "failure";
          } else {
            const providerResponse = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/resend`, {
              method: "POST", headers: { apikey: env.SUPABASE_ANON_KEY, "Content-Type": "application/json" },
              body: JSON.stringify({ type: "signup", email: emailRow.email })
            });
            if (!providerResponse.ok) { reason = "The provider could not resend verification."; result = "failure"; }
          }
        } else {
          reason = "Invitation delivery requires a household context and is not sent from the platform console."; result = "failure";
        }
      }
    } catch { result = "failure"; reason = "The requested operations action could not be completed."; }
    await writePlatformAudit(db, { operatorAccountId: operator.accountId, targetAccountId: params.accountId, action, result, reason: reason || null, requestId });
    if (result === "failure") throw validationError(reason);
    return success({ action, account: await accountDetails(db, params.accountId) }, requestId);
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "GET") return onRequestGet(context);
  if (context.request.method === "POST") return onRequestPost(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET or POST"); });
}
