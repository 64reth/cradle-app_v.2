export type HealthStatus = "healthy" | "degraded" | "unavailable" | "unknown";
export type HealthSignal = {
  status: HealthStatus;
  explanation: string;
  lastCheckedAt: string;
  durationMs?: number;
  code?: string;
};

type Check = () => Promise<void>;
export async function safeHealthCheck(explanation: string, check: Check, unavailableCode: string): Promise<HealthSignal> {
  const started = performance.now();
  try {
    await check();
    return { status: "healthy", explanation, lastCheckedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started) };
  } catch {
    return { status: "unavailable", explanation: "The check could not be completed safely.",
      lastCheckedAt: new Date().toISOString(), durationMs: Math.round(performance.now() - started), code: unavailableCode };
  }
}

export async function requireTables(db: D1Database, tables: string[]): Promise<void> {
  const placeholders = tables.map(() => "?").join(",");
  const result = await db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`).bind(...tables).all();
  const present = new Set(result.results.map((row) => String(row.name)));
  if (tables.some((table) => !present.has(table))) throw new Error("schema unavailable");
}

