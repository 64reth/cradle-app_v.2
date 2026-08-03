import { requirePlatformOperator } from "../auth-provider";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../http";
import type { CradleEnv } from "../types";
import { requireTables, safeHealthCheck, type HealthSignal, type HealthStatus } from "../../domain/household/health";

type Context = { request: Request; env: CradleEnv };
type Signals = Record<string, HealthSignal>;

const tableCheck = (db: D1Database, tables: string[]) => () => requireTables(db, tables);
const unknown = (explanation: string): HealthSignal => ({ status: "unknown", explanation, lastCheckedAt: new Date().toISOString() });

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env);
    await requirePlatformOperator(db, request);
    const started = performance.now();
    const signals: Signals = {};
    const checks: Array<[string, string, string[]]> = [
      ["authentication", "Provider and authentication schema are available.", ["auth_identities", "account_security", "auth_events"]],
      ["sessions", "Identity and household session stores are available.", ["identity_sessions", "sessions", "session_metadata"]],
      ["members", "The canonical member store and account links are available.", ["members", "user_accounts"]],
      ["invitations", "Invitation and replacement state can be queried.", ["household_invites"]],
      ["joinRequests", "Join-request review state can be queried.", ["household_join_requests"]],
      ["meals", "Meal and weekly-plan read stores are available.", ["meals", "weekly_meal_plans"]],
      ["schedule", "Schedule events and participants are available.", ["household_events", "household_event_members"]],
      ["routines", "Routines, assignments and task instances are available.", ["household_systems", "routine_assignments", "household_task_instances"]]
    ];
    for (const [key, explanation, tables] of checks) {
      signals[key] = await safeHealthCheck(explanation, tableCheck(db, tables), `${key.toUpperCase()}_CHECK_UNAVAILABLE`);
    }
    signals.database = await safeHealthCheck("D1 accepted a lightweight query.", async () => {
      const row = await db.prepare("SELECT 1 AS ok").bind().first<{ ok: number }>(); if (row?.ok !== 1) throw new Error("database unavailable");
    }, "DATABASE_CHECK_UNAVAILABLE");
    signals.worker = { status: "healthy", explanation: "The protected Worker route registry is responding.",
      lastCheckedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started) };
    signals.apiLatency = { status: "unknown", explanation: "Not enough privacy-safe request history for a global percentile.", lastCheckedAt: new Date().toISOString() };
    try {
      const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const result = await db.prepare(`SELECT count(*) AS count FROM alpha_diagnostic_events
        WHERE created_at >= ? AND event_name = 'action_failed'`).bind(since).first<{ count: number }>();
      signals.outstandingErrors = { status: Number(result?.count || 0) > 0 ? "degraded" : "healthy",
        explanation: `${Number(result?.count || 0)} safe error-class events in the past 24 hours.`, lastCheckedAt: new Date().toISOString() };
    } catch { signals.outstandingErrors = unknown("Diagnostics are unavailable; outstanding errors are unknown."); }
    const statuses = Object.values(signals).map(({ status }) => status);
    const overall: HealthStatus = statuses.includes("unavailable") || statuses.includes("degraded") ? "degraded" :
      statuses.every((status) => status === "unknown") ? "unknown" : "healthy";
    const recordedTests = env.VALIDATED_TEST_COUNT && /^\d+$/.test(env.VALIDATED_TEST_COUNT)
      ? Number(env.VALIDATED_TEST_COUNT) : null;
    return success({ overall, checkedAt: new Date().toISOString(), requestDurationMs: Math.round(performance.now() - started),
      signals, build: { version: env.APP_VERSION || "local", commit: env.BUILD_SHA?.slice(0, 12) || null,
        builtAt: env.BUILD_TIME || null, validatedTestCount: recordedTests,
        testCountLabel: recordedTests === null ? "Not recorded for this build" : "Recorded for this deployed build" } }, requestId);
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
