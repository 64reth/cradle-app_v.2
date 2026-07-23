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
    readFileSync("migrations/0003_household_setup_rooms_and_pets.sql", "utf8") +
    readFileSync("migrations/0004_household_systems.sql", "utf8");
  writeFileSync(join(workspace, "migration.sql"), migration);
  sqlite(migration);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("authentication migration", () => {
  it("applies all four migrations and operational domain tables", () => {
    const tables = sqlite("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
      .trim()
      .split("\n");

    expect(tables).toEqual(["authentication_attempts", "companions", "household_system_participants", "household_system_steps",
      "household_systems", "households", "invitation_codes", "members", "pets", "rooms", "sessions"]);
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
      INSERT INTO rooms VALUES ('r1', 'h1', ' Kitchen ', NULL, 0, 1, 'now', 'now', 'kitchen');
      INSERT INTO rooms VALUES ('r2', 'h2', 'Kitchen', NULL, 0, 1, 'now', 'now', 'kitchen');
      UPDATE rooms SET is_active = 0 WHERE household_id = 'h1';
      INSERT INTO rooms VALUES ('r3', 'h1', 'Kitchen', NULL, 1, 1, 'now', 'now', 'kitchen');
    `);
    expect(() => sqlite("INSERT INTO rooms VALUES ('r4', 'h1', 'kitchen', NULL, 2, 1, 'now', 'now', 'kitchen');")).toThrow();
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

  it("keeps migration 0004 additive", () => {
    const migration = readFileSync("migrations/0004_household_systems.sql", "utf8");
    expect(migration).not.toMatch(/^\s*(DROP|DELETE\s+FROM|UPDATE)\b/im);
    expect(migration).toContain("CREATE TABLE household_systems");
  });

  it("preserves an existing Phase 3 household when migration 0004 is applied", () => {
    const legacyPath = join(workspace, "phase-3.sqlite");
    const phaseThree = readFileSync("migrations/0001_foundation.sql", "utf8") +
      readFileSync("migrations/0002_authentication.sql", "utf8") +
      readFileSync("migrations/0003_household_setup_rooms_and_pets.sql", "utf8");
    execFileSync("sqlite3", [legacyPath], { input: phaseThree, encoding: "utf8" });
    execFileSync("sqlite3", [legacyPath], { input: `
      PRAGMA foreign_keys = ON;
      INSERT INTO households (id, name, created_at, updated_at, setup_status, setup_step)
        VALUES ('existing', 'Existing Home', 'before', 'before', 'complete', 'complete');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at)
        VALUES ('owner', 'existing', 'Alex', 'owner', 'before', 'before');
      INSERT INTO rooms VALUES ('kitchen', 'existing', 'Kitchen', NULL, 0, 1, 'before', 'before');
      INSERT INTO pets VALUES ('tori', 'existing', 'Tori', 'cat', NULL, NULL, 1, 'before', 'before');
    `, encoding: "utf8" });
    execFileSync("sqlite3", [legacyPath], {
      input: readFileSync("migrations/0004_household_systems.sql", "utf8"), encoding: "utf8"
    });
    const preserved = execFileSync("sqlite3", [legacyPath], {
      input: `SELECT h.name || '|' || h.setup_status || '|' ||
        (SELECT count(*) FROM members WHERE household_id = h.id) || '|' ||
        (SELECT count(*) FROM rooms WHERE household_id = h.id) || '|' ||
        (SELECT count(*) FROM pets WHERE household_id = h.id)
        FROM households h WHERE h.id = 'existing';`,
      encoding: "utf8"
    }).trim();
    expect(preserved).toBe("Existing Home|complete|1|1|1");
  });

  it("stores a tenant-scoped generated routine with deterministic steps", () => {
    sqlite(`
      PRAGMA foreign_keys = ON;
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, is_active, created_at, updated_at) VALUES ('m1', 'h1', 'Alex', 'owner', 1, 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, is_active, created_at, updated_at) VALUES ('m2', 'h1', 'Sam', 'adult', 1, 'now', 'now');
      INSERT INTO rooms VALUES ('r1', 'h1', 'Kitchen', NULL, 0, 1, 'now', 'now', 'kitchen');
      INSERT INTO pets VALUES ('p1', 'h1', 'Tori', 'cat', NULL, NULL, 1, 'now', 'now');
      INSERT INTO household_systems (id, household_id, name, purpose, pet_id, owner_member_id, status,
        frequency_key, estimated_minutes, definition_of_done, display_order, source_kind, source_template_key,
        source_template_version, created_at, updated_at)
        VALUES ('sys1', 'h1', 'Feed Tori', 'Fresh food', 'p1', 'm1', 'active', 'daily', 10,
          'Tori has food', 0, 'template', 'pet.cat.morning_feed', 1, 'now', 'now');
      INSERT INTO household_system_steps VALUES ('step2', 'h1', 'sys1', 'Add food', 1, 1, 'now', 'now');
      INSERT INTO household_system_steps VALUES ('step1', 'h1', 'sys1', 'Wash bowl', 0, 1, 'now', 'now');
      INSERT INTO household_system_participants VALUES ('h1', 'sys1', 'm2', 'now');
    `);
    expect(sqlite("SELECT label FROM household_system_steps ORDER BY display_order;").trim().split("\n")).toEqual(["Wash bowl", "Add food"]);
    expect(sqlite("PRAGMA foreign_key_check;")).toBe("");
  });

  it("rejects cross-household Room, Pet, owner and participant references", () => {
    sqlite(`
      PRAGMA foreign_keys = ON;
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h2', 'Two', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at) VALUES ('m1', 'h1', 'Alex', 'owner', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at) VALUES ('m2', 'h2', 'Sam', 'owner', 'now', 'now');
      INSERT INTO rooms VALUES ('r2', 'h2', 'Kitchen', NULL, 0, 1, 'now', 'now', 'kitchen');
      INSERT INTO pets VALUES ('p2', 'h2', 'Tori', 'cat', NULL, NULL, 1, 'now', 'now');
    `);
    const insert = (room: string, pet: string, owner: string) => `PRAGMA foreign_keys = ON;
      INSERT INTO household_systems (id, household_id, name, purpose, room_id, pet_id, owner_member_id, status,
      frequency_key, estimated_minutes, definition_of_done, display_order, source_kind, client_key, created_at, updated_at)
      VALUES ('sys', 'h1', 'Reset', 'Purpose', ${room}, ${pet}, '${owner}', 'active', 'weekly', 10,
        'Room ready', 0, 'custom', 'custom-one', 'now', 'now');`;
    expect(() => sqlite(insert("'r2'", "NULL", "m1"))).toThrow();
    expect(() => sqlite(insert("NULL", "'p2'", "m1"))).toThrow();
    expect(() => sqlite(insert("NULL", "NULL", "m2"))).toThrow();
  });

  it("enforces child tenant scope and unique child ordering", () => {
    sqlite(`
      PRAGMA foreign_keys = ON;
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h2', 'Two', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at) VALUES ('m1', 'h1', 'Alex', 'owner', 'now', 'now');
      INSERT INTO household_systems (id, household_id, name, purpose, owner_member_id, status, frequency_key,
        estimated_minutes, definition_of_done, display_order, source_kind, client_key, created_at, updated_at)
        VALUES ('sys1', 'h1', 'Reset', 'Purpose', 'm1', 'active', 'weekly', 10, 'Ready', 0, 'custom', 'custom-one', 'now', 'now');
      INSERT INTO household_system_steps VALUES ('step1', 'h1', 'sys1', 'One', 0, 1, 'now', 'now');
    `);
    expect(() => sqlite("PRAGMA foreign_keys = ON; INSERT INTO household_system_steps VALUES ('bad', 'h2', 'sys1', 'Bad', 0, 1, 'now', 'now');")).toThrow();
    expect(() => sqlite("INSERT INTO household_system_steps VALUES ('step2', 'h1', 'sys1', 'Two', 0, 1, 'now', 'now');")).toThrow();
  });

  it("prevents duplicate generated routines but allows the same recommendation for distinct Rooms", () => {
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at) VALUES ('m1', 'h1', 'Alex', 'owner', 'now', 'now');
      INSERT INTO rooms VALUES ('r1', 'h1', 'Bedroom 1', NULL, 0, 1, 'now', 'now', 'bedroom');
      INSERT INTO rooms VALUES ('r2', 'h1', 'Bedroom 2', NULL, 1, 1, 'now', 'now', 'bedroom');
      INSERT INTO household_systems (id, household_id, name, purpose, room_id, owner_member_id, status, frequency_key,
        estimated_minutes, definition_of_done, display_order, source_kind, source_template_key, source_template_version, created_at, updated_at)
        VALUES ('sys1', 'h1', 'Bedroom clean', 'Clean', 'r1', 'm1', 'active', 'weekly', 10, 'Ready', 0,
          'template', 'bedroom.weekly_clean', 1, 'now', 'now');
      INSERT INTO household_systems (id, household_id, name, purpose, room_id, owner_member_id, status, frequency_key,
        estimated_minutes, definition_of_done, display_order, source_kind, source_template_key, source_template_version, created_at, updated_at)
        VALUES ('sys2', 'h1', 'Bedroom clean', 'Clean', 'r2', 'm1', 'active', 'weekly', 10, 'Ready', 1,
          'template', 'bedroom.weekly_clean', 1, 'now', 'now');
    `);
    expect(sqlite("SELECT count(*) FROM household_systems;").trim()).toBe("2");
    expect(() => sqlite(`INSERT INTO household_systems (id, household_id, name, purpose, owner_member_id, status,
      room_id, frequency_key, estimated_minutes, definition_of_done, display_order, source_kind, source_template_key,
      source_template_version, created_at, updated_at)
      VALUES ('sys3', 'h1', 'Bedroom clean', 'Duplicate', 'm1', 'active', 'r1', 'weekly', 10, 'Ready', 2,
        'template', 'bedroom.weekly_clean', 1, 'now', 'now');`)).toThrow();
  });
});
