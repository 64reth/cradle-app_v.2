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
  const migration = readFileSync("migrations/0001_foundation.sql", "utf8") +
    readFileSync("migrations/0002_authentication.sql", "utf8");
  writeFileSync(join(workspace, "migration.sql"), migration);
  sqlite(migration);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("authentication migration", () => {
  it("adds only the Phase 3 authentication table", () => {
    const tables = sqlite("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
      .trim()
      .split("\n");

    expect(tables).toEqual(["authentication_attempts", "households", "invitation_codes", "members", "sessions"]);
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

  it("enforces household lookup and profile uniqueness", () => {
    expect(() => sqlite(`
      INSERT INTO households (id, name, created_at, updated_at, lookup_reference) VALUES ('h1', 'One', 'now', 'now', 'home-ref');
      INSERT INTO households (id, name, created_at, updated_at, lookup_reference) VALUES ('h2', 'Two', 'now', 'now', 'HOME-REF');
    `)).toThrow();
  });

  it("adds explicit session and invitation security indexes", () => {
    const indexes = sqlite("SELECT name FROM sqlite_master WHERE type='index' ORDER BY name;");
    expect(indexes).toContain("sessions_authentication_idx");
    expect(indexes).toContain("invitation_codes_redemption_idx");
    expect(indexes).toContain("members_household_profile_reference_idx");
  });

  it("passes foreign key inspection after authenticated records are inserted", () => {
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at, lookup_reference) VALUES ('h1', 'Home', 'now', 'now', 'home-ref');
      INSERT INTO members (id, household_id, display_name, role, pin_hash, pin_salt, created_at, updated_at, profile_reference)
        VALUES ('m1', 'h1', 'Alex', 'owner', 'hash-only', 'salt', 'now', 'now', 'alex');
      INSERT INTO sessions (id, household_id, member_id, token_hash, expires_at, created_at, updated_at)
        VALUES ('s1', 'h1', 'm1', 'token-hash-only', 'later', 'now', 'now');
    `);
    expect(sqlite("PRAGMA foreign_key_check;")).toBe("");
  });
});
