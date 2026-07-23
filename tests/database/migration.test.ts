import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let workspace = "";
let dbPath = "";

function sqlite(input: string) {
  return execFileSync("sqlite3", [dbPath], { input, encoding: "utf8" });
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "cradle-db-"));
  dbPath = join(workspace, "cradle.sqlite");
  const migration = readFileSync("migrations/0001_foundation.sql", "utf8");
  writeFileSync(join(workspace, "migration.sql"), migration);
  sqlite(migration);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("foundation migration", () => {
  it("creates only Phase 2 foundation tables", () => {
    const tables = sqlite("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
      .trim()
      .split("\n");

    expect(tables).toEqual(["households", "invitation_codes", "members", "sessions"]);
  });

  it("enforces foreign keys", () => {
    expect(() => sqlite(`
      PRAGMA foreign_keys = ON;
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at)
      VALUES ('member_1', 'missing_household', 'Alex', 'adult', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
    `)).toThrow();
  });

  it("rejects duplicate member names within one household", () => {
    expect(() => sqlite(`
      PRAGMA foreign_keys = ON;
      INSERT INTO households (id, name, timezone, created_at, updated_at) VALUES ('house_1', 'Home', 'Europe/London', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at) VALUES ('member_1', 'house_1', 'Alex', 'owner', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at) VALUES ('member_2', 'house_1', 'alex', 'adult', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
    `)).toThrow();
  });

  it("allows the same member display name in different households", () => {
    sqlite(`
      PRAGMA foreign_keys = ON;
      INSERT INTO households (id, name, timezone, created_at, updated_at) VALUES ('house_1', 'Home A', 'Europe/London', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
      INSERT INTO households (id, name, timezone, created_at, updated_at) VALUES ('house_2', 'Home B', 'Europe/London', '2026-07-23T00:00:01Z', '2026-07-23T00:00:01Z');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at) VALUES ('member_1', 'house_1', 'Alex', 'owner', '2026-07-23T00:00:00Z', '2026-07-23T00:00:00Z');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at) VALUES ('member_1', 'house_2', 'Alex', 'owner', '2026-07-23T00:00:01Z', '2026-07-23T00:00:01Z');
    `);

    expect(sqlite("PRAGMA foreign_key_check;")).toBe("");
  });
});
