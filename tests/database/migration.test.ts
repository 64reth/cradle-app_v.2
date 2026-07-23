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
    readFileSync("migrations/0002_authentication.sql", "utf8") +
    readFileSync("migrations/0003_household_setup_rooms_and_pets.sql", "utf8");
  writeFileSync(join(workspace, "migration.sql"), migration);
  sqlite(migration);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("authentication migration", () => {
  it("applies all three migrations and setup domain tables", () => {
    const tables = sqlite("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
      .trim()
      .split("\n");

    expect(tables).toEqual(["authentication_attempts", "companions", "households", "invitation_codes", "members", "pets", "rooms", "sessions"]);
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

  it("backfills existing households as setup-incomplete at leadership", () => {
    sqlite("INSERT INTO households (id, name, created_at, updated_at) VALUES ('existing', 'Existing', 'now', 'now');");
    expect(sqlite("SELECT setup_status || '|' || setup_step FROM households WHERE id = 'existing';").trim()).toBe("incomplete|leadership");
  });

  it("enforces Room tenant uniqueness only for active names", () => {
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h2', 'Two', 'now', 'now');
      INSERT INTO rooms VALUES ('r1', 'h1', ' Kitchen ', NULL, 0, 1, 'now', 'now');
      INSERT INTO rooms VALUES ('r2', 'h2', 'Kitchen', NULL, 0, 1, 'now', 'now');
      UPDATE rooms SET is_active = 0 WHERE household_id = 'h1';
      INSERT INTO rooms VALUES ('r3', 'h1', 'Kitchen', NULL, 1, 1, 'now', 'now');
    `);
    expect(() => sqlite("INSERT INTO rooms VALUES ('r4', 'h1', 'kitchen', NULL, 2, 1, 'now', 'now');")).toThrow();
  });

  it("accepts every supported Pet type and optional fields", () => {
    sqlite("INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');");
    const types = ["dog","cat","fish","bird","rabbit","hamster","guinea_pig","reptile","tortoise","horse","chicken","other"];
    types.forEach((type, index) => sqlite(`INSERT INTO pets VALUES ('p${index}', 'h1', 'Pet', '${type}', 'Breed', 'Notes', 1, 'now', 'now');`));
    expect(sqlite("SELECT count(*) FROM pets;").trim()).toBe("12");
    expect(() => sqlite("INSERT INTO pets VALUES ('bad', 'h1', 'Pet', 'dragon', NULL, NULL, 1, 'now', 'now');")).toThrow();
  });

  it("keeps Pets separate from members and sessions", () => {
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO pets VALUES ('p1', 'h1', 'Miso', 'cat', NULL, NULL, 1, 'now', 'now');
    `);
    expect(sqlite("SELECT (SELECT count(*) FROM pets) || '|' || (SELECT count(*) FROM members) || '|' || (SELECT count(*) FROM sessions);").trim()).toBe("1|0|0");
  });

  it("stores one active Companion without creating an identity or Pet", () => {
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO companions VALUES ('c1', 'h1', 'Cradle Cat', 'orange', 'cream', 'white', 'neutral', 1, 'now', 'now');
    `);
    expect(sqlite("SELECT (SELECT count(*) FROM companions) || '|' || (SELECT count(*) FROM members) || '|' || (SELECT count(*) FROM pets) || '|' || (SELECT count(*) FROM sessions);").trim()).toBe("1|0|0|0");
    expect(() => sqlite("INSERT INTO companions VALUES ('c2', 'h1', 'Other Cat', 'grey', 'cream', 'white', 'neutral', 1, 'now', 'now');")).toThrow();
  });
});
