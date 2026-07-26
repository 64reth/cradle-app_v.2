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
    readFileSync("migrations/0004_household_systems.sql", "utf8") +
    readFileSync("migrations/0005_members_invitations_and_personal_areas.sql", "utf8") +
    readFileSync("migrations/0006_household_coordination.sql", "utf8") +
    readFileSync("migrations/0007_remove_household_guide.sql", "utf8") +
    readFileSync("migrations/0008_family_assignments_and_daily_tasks.sql", "utf8") +
    readFileSync("migrations/0009_meal_rotation_and_weekly_plans.sql", "utf8") +
    readFileSync("migrations/0010_together.sql", "utf8") +
    readFileSync("migrations/0011_together_swap_indexes.sql", "utf8") +
    readFileSync("migrations/0012_alpha_diagnostics.sql", "utf8") +
    readFileSync("migrations/0013_authentication_operations.sql", "utf8");
  writeFileSync(join(workspace, "migration.sql"), migration);
  sqlite(migration);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("authentication migration", () => {
  it("applies all thirteen additive migrations and operational domain tables", () => {
    const tables = sqlite("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
      .trim()
      .split("\n");

    expect(tables).toEqual(["account_security", "alpha_diagnostic_events", "alpha_feedback", "auth_events", "auth_identities", "authentication_attempts", "companions", "household_event_members", "household_events",
      "household_invites", "household_join_requests", "household_system_participants", "household_system_steps", "household_systems",
      "household_task_instances", "household_task_participants", "households", "identity_sessions", "invitation_codes",
      "meal_favourites", "meal_ingredients", "meal_rotation_slots", "meal_rotations", "meal_shopping_list_items", "meal_shopping_lists", "meals",
      "member_companions", "member_meal_preferences", "members", "pets", "platform_audit_log", "platform_operators", "profile_preferences", "profiles",
      "room_occupants", "rooms", "routine_assignment_history", "routine_assignment_participants", "routine_assignments", "session_metadata", "sessions", "task_help_requests", "task_suggestions", "together_daily_moments", "together_member_preferences",
      "together_memories", "together_moment_history", "together_moment_participants", "together_moment_templates",
      "together_tradition_participants", "together_traditions", "user_accounts",
      "weekly_meal_plan_slots", "weekly_meal_plans"]);
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

  it("adds Together templates and enforces one primary plus one optional Moment per day", () => {
    expect(Number(sqlite("SELECT count(*) FROM together_moment_templates WHERE household_id IS NULL;").trim())).toBeGreaterThanOrEqual(15);
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('together-home', 'Together Home', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, access_level, age_band, created_at, updated_at)
        VALUES ('together-member', 'together-home', 'Alex', 'owner', 'household_admin', 'adult', 'now', 'now');
      INSERT INTO together_daily_moments
        (id, household_id, local_date, template_id, title_snapshot, description_snapshot, moment_type, is_primary,
         generated_reason, duration_minutes, category, generated_at, created_at, updated_at)
        VALUES ('together-primary', 'together-home', '2026-08-05', 'system-family-charades', 'Charades', 'Play', 'whole_family', 1, 'daily', 30, 'games', 'now', 'now', 'now');
      INSERT INTO together_daily_moments
        (id, household_id, local_date, template_id, title_snapshot, description_snapshot, moment_type, is_primary,
         generated_reason, duration_minutes, category, generated_at, created_at, updated_at)
        VALUES ('together-secondary', 'together-home', '2026-08-05', 'system-family-quiz', 'Quiz', 'Play', 'whole_family', 0, 'daily', 30, 'learning', 'now', 'now', 'now');
    `);
    expect(() => sqlite(`INSERT INTO together_daily_moments
      (id, household_id, local_date, template_id, title_snapshot, description_snapshot, moment_type, is_primary,
       generated_reason, duration_minutes, category, generated_at, created_at, updated_at)
      VALUES ('together-duplicate', 'together-home', '2026-08-05', 'system-family-walk', 'Walk', 'Walk', 'whole_family', 1, 'daily', 30, 'outdoors', 'now', 'now', 'now');`)).toThrow();
  });

  it("allows a swapped primary to preserve the optional secondary slot", () => {
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('swap-home', 'Swap Home', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, access_level, age_band, created_at, updated_at)
        VALUES ('swap-member', 'swap-home', 'Alex', 'owner', 'household_admin', 'adult', 'now', 'now');
      INSERT INTO together_daily_moments
        (id, household_id, local_date, template_id, title_snapshot, description_snapshot, moment_type, status, is_primary,
         generated_reason, duration_minutes, category, generated_at, created_at, updated_at)
        VALUES ('swap-primary', 'swap-home', '2026-08-08', 'system-family-charades', 'Charades', 'Play', 'whole_family', 'suggested', 1, 'daily', 30, 'games', 'now', 'now', 'now');
      INSERT INTO together_daily_moments
        (id, household_id, local_date, template_id, title_snapshot, description_snapshot, moment_type, status, is_primary,
         generated_reason, duration_minutes, category, generated_at, created_at, updated_at)
        VALUES ('swap-secondary', 'swap-home', '2026-08-08', 'system-family-quiz', 'Quiz', 'Play', 'whole_family', 'suggested', 0, 'daily', 30, 'learning', 'now', 'now', 'now');
      UPDATE together_daily_moments SET status = 'swapped', is_primary = 0 WHERE household_id = 'swap-home' AND id = 'swap-primary';
      INSERT INTO together_daily_moments
        (id, household_id, local_date, template_id, title_snapshot, description_snapshot, moment_type, status, is_primary,
         generated_reason, duration_minutes, category, generated_at, created_at, updated_at)
        VALUES ('swap-replacement', 'swap-home', '2026-08-08', 'system-family-walk', 'Walk', 'Walk', 'whole_family', 'suggested', 1, 'daily', 30, 'outdoors', 'now', 'now', 'now');
    `);
    expect(sqlite("SELECT count(*) FROM together_daily_moments WHERE household_id = 'swap-home' AND local_date = '2026-08-08';").trim()).toBe("3");
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

  it("keeps the historical synthetic table inactive and unable to create identities", () => {
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO companions VALUES ('c1', 'h1', 'Retired', 'orange', 'cream', 'white', 'neutral', 0, 'now', 'now');
    `);
    expect(sqlite("SELECT (SELECT count(*) FROM companions) || '|' || (SELECT count(*) FROM members) || '|' || (SELECT count(*) FROM pets) || '|' || (SELECT count(*) FROM sessions);").trim()).toBe("1|0|0|0");
    expect(() => sqlite("INSERT INTO companions VALUES ('c2', 'h1', 'Retired', 'grey', 'cream', 'white', 'neutral', 1, 'now', 'now');")).toThrow();
    expect(() => sqlite("UPDATE companions SET is_active = 1 WHERE id = 'c1';")).toThrow();
  });

  it("keeps migration 0004 additive", () => {
    const migration = readFileSync("migrations/0004_household_systems.sql", "utf8");
    expect(migration).not.toMatch(/^\s*(DROP|DELETE\s+FROM|UPDATE)\b/im);
    expect(migration).toContain("CREATE TABLE household_systems");
  });

  it("keeps migration 0005 additive and leaves earlier migrations unchanged", () => {
    const migration = readFileSync("migrations/0005_members_invitations_and_personal_areas.sql", "utf8");
    expect(migration).not.toMatch(/^\s*(DROP|DELETE\s+FROM|UPDATE)\b/im);
    expect(migration).toContain("CREATE TABLE user_accounts");
    expect(migration).toContain("CREATE TABLE household_invites");
    expect(migration).toContain("CREATE TABLE member_companions");
    expect(migration).toContain("CREATE TABLE task_suggestions");
  });

  it("keeps migration 0006 additive and models coordination without task records", () => {
    const migration = readFileSync("migrations/0006_household_coordination.sql", "utf8");
    expect(migration).not.toMatch(/^\s*(DROP|DELETE\s+FROM|UPDATE|ALTER)\b/im);
    expect(migration).toContain("CREATE TABLE household_events");
    expect(migration).toContain("CREATE TABLE household_event_members");
    expect(migration).not.toMatch(/task_instance|generated_task/i);
  });

  it("keeps migration 0008 additive and backfills canonical access without losing legacy family data", () => {
    const migration = readFileSync("migrations/0008_family_assignments_and_daily_tasks.sql", "utf8");
    expect(migration).not.toMatch(/^\s*(DROP|DELETE\s+FROM)\b/im);
    expect(migration).toContain("ALTER TABLE members ADD COLUMN access_level");
    expect(migration).toContain("ALTER TABLE members ADD COLUMN age_band");
    expect(migration).toContain("CREATE TABLE room_occupants");
    expect(migration).toContain("CREATE TABLE routine_assignments");
    expect(migration).toContain("CREATE TABLE household_task_instances");
    expect(sqlite(`SELECT access_level || '|' || age_band FROM members
      WHERE role = 'owner' LIMIT 1;`).trim()).toBe("");
  });

  it("keeps alpha diagnostics additive and household-scoped", () => {
    const migration = readFileSync("migrations/0012_alpha_diagnostics.sql", "utf8");
    expect(migration).not.toMatch(/^\s*(DROP|DELETE\s+FROM|UPDATE)\b/im);
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS alpha_diagnostic_events");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS alpha_feedback");
    expect(migration).toContain("FOREIGN KEY (household_id, member_id)");
  });

  it("keeps authentication and operations records additive and audit records immutable", () => {
    const migration = readFileSync("migrations/0013_authentication_operations.sql", "utf8");
    expect(migration).not.toMatch(/^\s*(DROP|DELETE\s+FROM)\b/im);
    expect(migration).toContain("CREATE TABLE auth_identities");
    expect(migration).toContain("CREATE TABLE platform_operators");
    expect(migration).toContain("platform_audit_log_immutable_update");
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('ops-home', 'Ops Home', 'now', 'now');
      INSERT INTO user_accounts (id, account_reference, display_name, pin_hash, pin_salt, created_at, updated_at)
        VALUES ('ops-account', 'ops-ref', 'Operator', 'hash', 'salt', 'now', 'now');
      INSERT INTO platform_operators (account_id, created_at, updated_at) VALUES ('ops-account', 'now', 'now');
      INSERT INTO platform_audit_log (id, operator_account_id, action, result, created_at)
        VALUES ('audit', 'ops-account', 'view_account', 'success', 'now');
    `);
    expect(() => sqlite("UPDATE platform_audit_log SET action = 'changed' WHERE id = 'audit';")).toThrow();
  });

  it("keeps migration 0009 additive and models the 7x4 rotation separately from weekly plans", () => {
    const migration = readFileSync("migrations/0009_meal_rotation_and_weekly_plans.sql", "utf8");
    expect(migration).not.toMatch(/^\s*(DROP|DELETE\s+FROM|UPDATE)\b/im);
    expect(migration).toContain("CREATE TABLE meal_rotations");
    expect(migration).toContain("CREATE TABLE meal_rotation_slots");
    expect(migration).toContain("CREATE TABLE weekly_meal_plans");
    expect(migration).toContain("CREATE TABLE weekly_meal_plan_slots");
    expect(migration).toContain("rotation_week_number INTEGER NOT NULL CHECK(rotation_week_number BETWEEN 1 AND 4)");
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('meal-home', 'Meal Home', 'now', 'now');
      INSERT INTO meal_rotations (id, household_id, title, created_at, updated_at)
        VALUES ('rotation', 'meal-home', 'Family dinners', 'now', 'now');
      INSERT INTO meal_rotation_slots
        (id, household_id, meal_rotation_id, rotation_week_number, day_of_week, meal_type, slot_kind, created_at, updated_at)
        VALUES ('slot', 'meal-home', 'rotation', 4, 7, 'dinner', 'leftovers', 'now', 'now');
      INSERT INTO weekly_meal_plans (id, household_id, week_start, source_rotation_id, rotation_week_number, created_at, updated_at)
        VALUES ('plan', 'meal-home', '2026-08-03', 'rotation', 4, 'now', 'now');
      INSERT INTO weekly_meal_plan_slots
        (id, household_id, weekly_meal_plan_id, day_of_week, meal_type, source_rotation_slot_id, override_kind, created_at, updated_at)
        VALUES ('plan-slot', 'meal-home', 'plan', 7, 'dinner', 'slot', 'this_week', 'now', 'now');
    `);
    expect(sqlite("SELECT p.rotation_week_number || '|' || s.override_kind FROM weekly_meal_plan_slots s JOIN weekly_meal_plans p ON p.household_id = s.household_id AND p.id = s.weekly_meal_plan_id;").trim()).toBe("4|this_week");
  });

  it("stores recurring household events, reminders and tenant-scoped participants", () => {
    sqlite(`
      PRAGMA foreign_keys = ON;
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at)
        VALUES ('owner', 'h1', 'Gareth', 'owner', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at, lifecycle_state, age_group)
        VALUES ('child', 'h1', 'Taryn', 'child', 'now', 'now', 'managed', 'child');
      INSERT INTO household_events
        (id, household_id, created_by_member_id, title, event_type, starts_at, timezone,
          recurrence_key, reminder_minutes, visibility, status, client_key, created_at, updated_at)
        VALUES ('review', 'h1', 'owner', 'Weekly Review', 'weekly_review', '2026-08-02T18:00:00Z',
          'Europe/London', 'weekly', 30, 'household', 'active', 'review-client', 'now', 'now');
      INSERT INTO household_event_members VALUES ('h1', 'review', 'owner', 'attendee', 'now');
      INSERT INTO household_event_members VALUES ('h1', 'review', 'child', 'attendee', 'now');
    `);
    expect(sqlite(`SELECT title || '|' || recurrence_key || '|' || reminder_minutes
      FROM household_events WHERE id = 'review';`).trim()).toBe("Weekly Review|weekly|30");
    expect(sqlite("SELECT count(*) FROM household_event_members WHERE event_id = 'review';").trim()).toBe("2");
    expect(sqlite("PRAGMA foreign_key_check;")).toBe("");
  });

  it("rejects cross-household event participants and duplicate event retries", () => {
    sqlite(`
      PRAGMA foreign_keys = ON;
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h2', 'Two', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at)
        VALUES ('owner', 'h1', 'Gareth', 'owner', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at)
        VALUES ('foreign', 'h2', 'Other', 'owner', 'now', 'now');
      INSERT INTO household_events
        (id, household_id, created_by_member_id, title, event_type, starts_at, timezone,
          recurrence_key, visibility, status, client_key, created_at, updated_at)
        VALUES ('event', 'h1', 'owner', 'Trip', 'trip', '2026-08-02T18:00:00Z',
          'Europe/London', 'one_off', 'household', 'active', 'event-client', 'now', 'now');
    `);
    expect(() => sqlite(`
      PRAGMA foreign_keys = ON;
      INSERT INTO household_event_members VALUES ('h1', 'event', 'foreign', 'attendee', 'now');
    `)).toThrow();
    expect(() => sqlite(`INSERT INTO household_events
      (id, household_id, created_by_member_id, title, event_type, starts_at, timezone,
        recurrence_key, visibility, status, client_key, created_at, updated_at)
      VALUES ('duplicate', 'h1', 'owner', 'Other', 'event', '2026-08-03T18:00:00Z',
        'Europe/London', 'one_off', 'household', 'active', 'event-client', 'now', 'now');`)).toThrow();
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

  it("separates accounts from Members and prevents duplicate claims in one household", () => {
    sqlite(`
      INSERT INTO user_accounts VALUES ('a1', 'alex-account', 'Alex', 'hash', 'salt', 1, 'now', 'now');
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at, account_id, lifecycle_state)
        VALUES ('m1', 'h1', 'Alex', 'owner', 'now', 'now', 'a1', 'active');
    `);
    expect(() => sqlite(`INSERT INTO members
      (id, household_id, display_name, role, created_at, updated_at, account_id, lifecycle_state)
      VALUES ('m2', 'h1', 'Other', 'adult', 'now', 'now', 'a1', 'active');`)).toThrow();
    expect(sqlite("PRAGMA foreign_key_check;")).toBe("");
  });

  it("stores managed profiles without accounts and one Companion per Member", () => {
    sqlite(`
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at, lifecycle_state, age_group)
        VALUES ('child', 'h1', 'Taryn', 'child', 'now', 'now', 'managed', 'child');
      INSERT INTO member_companions VALUES
        ('c1', 'h1', 'child', 'Pip', 'orange', 'cream', 'white', 'neutral', 1, 'now', 'now');
    `);
    expect(sqlite("SELECT (CASE WHEN account_id IS NULL THEN '1' ELSE '0' END) || '|' || lifecycle_state FROM members WHERE id = 'child';").trim()).toBe("1|managed");
    expect(() => sqlite(`INSERT INTO member_companions VALUES
      ('c2', 'h1', 'child', 'Other', 'grey', 'cream', 'white', 'neutral', 1, 'now', 'now');`)).toThrow();
  });

  it("archives only legacy synthetic household rows and preserves real family avatars", () => {
    const legacyPath = join(workspace, "legacy-guide.sqlite");
    const throughCoordination = [
      "0001_foundation.sql", "0002_authentication.sql", "0003_household_setup_rooms_and_pets.sql",
      "0004_household_systems.sql", "0005_members_invitations_and_personal_areas.sql",
      "0006_household_coordination.sql"
    ].map((name) => readFileSync(`migrations/${name}`, "utf8")).join("\n");
    execFileSync("sqlite3", [legacyPath], { input: `${throughCoordination}
      INSERT INTO households (id, name, created_at, updated_at, setup_status, setup_step)
        VALUES ('legacy', 'Legacy Home', 'now', 'now', 'incomplete', 'companion');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at, lifecycle_state)
        VALUES ('owner', 'legacy', 'Alex', 'owner', 'now', 'now', 'active');
      INSERT INTO companions
        (id, household_id, name, fur_palette_key, patch_primary_palette_key,
          patch_secondary_palette_key, expression_key, is_active, created_at, updated_at)
        VALUES ('synthetic', 'legacy', 'Old helper', 'orange', 'cream', 'white', 'neutral', 1, 'now', 'now');
      INSERT INTO member_companions
        (id, household_id, member_id, name, fur_palette_key, patch_primary_palette_key,
          patch_secondary_palette_key, expression_key, is_active, created_at, updated_at)
        VALUES ('avatar', 'legacy', 'owner', 'Alex', 'grey', 'cream', 'white', 'neutral', 1, 'now', 'now');
      ${readFileSync("migrations/0007_remove_household_guide.sql", "utf8")}`, encoding: "utf8" });
    const legacy = (query: string) => execFileSync("sqlite3", [legacyPath, query], { encoding: "utf8" });
    expect(legacy("SELECT is_active FROM companions WHERE id = 'synthetic';").trim()).toBe("0");
    expect(legacy("SELECT setup_step FROM households WHERE id = 'legacy';").trim()).toBe("companion");
    expect(legacy("SELECT member_id || '|' || fur_palette_key FROM member_companions WHERE id = 'avatar';").trim())
      .toBe("owner|grey");
    expect(legacy("SELECT count(*) FROM members WHERE household_id = 'legacy';").trim()).toBe("1");
  });

  it("maps legacy Family permissions and ages additively without losing assignments", () => {
    const legacyPath = join(workspace, "legacy-family.sqlite");
    const throughGuideRemoval = [
      "0001_foundation.sql", "0002_authentication.sql", "0003_household_setup_rooms_and_pets.sql",
      "0004_household_systems.sql", "0005_members_invitations_and_personal_areas.sql",
      "0006_household_coordination.sql", "0007_remove_household_guide.sql"
    ].map((name) => readFileSync(`migrations/${name}`, "utf8")).join("\n");
    execFileSync("sqlite3", [legacyPath], { input: `${throughGuideRemoval}
      PRAGMA foreign_keys = ON;
      INSERT INTO households (id, name, created_at, updated_at)
        VALUES ('legacy', 'Legacy Home', 'now', 'now');
      INSERT INTO members
        (id, household_id, display_name, role, lifecycle_state, age_group, created_at, updated_at)
        VALUES
        ('owner', 'legacy', 'Alex', 'owner', 'active', 'adult', 'now', 'now'),
        ('admin', 'legacy', 'Gillian', 'parent_admin', 'active', 'adult', 'now', 'now'),
        ('adult', 'legacy', 'Sam', 'adult', 'active', 'adult', 'now', 'now'),
        ('teen', 'legacy', 'Tyrel', 'child', 'managed', 'teen', 'now', 'now'),
        ('child', 'legacy', 'Taryn', 'child', 'managed', 'child', 'now', 'now'),
        ('young', 'legacy', 'Tia', 'child', 'managed', 'dependent', 'now', 'now');
      INSERT INTO rooms VALUES ('bedroom', 'legacy', 'Children bedroom', NULL, 0, 1, 'now', 'now', 'bedroom');
      INSERT INTO household_systems
        (id, household_id, name, purpose, room_id, owner_member_id, status, frequency_key,
          estimated_minutes, definition_of_done, display_order, source_kind, client_key,
          rotation_enabled, created_at, updated_at)
        VALUES ('routine', 'legacy', 'Room reset', 'Reset room', 'bedroom', 'owner', 'active',
          'daily', 10, 'Room ready', 0, 'custom', 'legacy-routine', 1, 'now', 'now');
      INSERT INTO household_system_participants
        (household_id, system_id, member_id, created_at)
        VALUES
        ('legacy', 'routine', 'teen', 'now'),
        ('legacy', 'routine', 'child', 'now');
      ${readFileSync("migrations/0008_family_assignments_and_daily_tasks.sql", "utf8")}`,
      encoding: "utf8"
    });
    const legacy = (query: string) => execFileSync("sqlite3", [legacyPath, query], { encoding: "utf8" });
    expect(legacy(`SELECT group_concat(id || ':' || access_level || ':' || age_band, '|')
      FROM (SELECT id, access_level, age_band FROM members ORDER BY
        CASE id WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'adult' THEN 2
        WHEN 'teen' THEN 3 WHEN 'child' THEN 4 ELSE 5 END);`).trim()).toBe(
      "owner:household_admin:adult|admin:household_admin:adult|adult:household_member:adult|" +
      "teen:managed_member:teen|child:managed_member:child|young:managed_member:young_child"
    );
    expect(legacy("SELECT assignment_mode || '|' || rotation_next_index FROM routine_assignments;").trim())
      .toBe("rotation|0");
    expect(legacy(`SELECT group_concat(member_id, ',') FROM
      (SELECT member_id FROM routine_assignment_participants ORDER BY participant_order);`).trim())
      .toBe("child,teen");
    expect(legacy("SELECT count(*) FROM members;").trim()).toBe("6");
    expect(legacy("SELECT count(*) FROM household_systems;").trim()).toBe("1");
    expect(legacy("PRAGMA foreign_key_check;")).toBe("");
  });

  it("tenant-scopes invitations and suggestions without fabricating task instances", () => {
    sqlite(`
      INSERT INTO user_accounts VALUES ('a1', 'alex-account', 'Alex', 'hash', 'salt', 1, 'now', 'now');
      INSERT INTO households (id, name, created_at, updated_at) VALUES ('h1', 'One', 'now', 'now');
      INSERT INTO members (id, household_id, display_name, role, created_at, updated_at, account_id)
        VALUES ('owner', 'h1', 'Alex', 'owner', 'now', 'now', 'a1');
      INSERT INTO rooms VALUES ('r1', 'h1', 'Kitchen', NULL, 0, 1, 'now', 'now', 'kitchen');
      INSERT INTO household_invites
        (id, household_id, token_hash, short_code_hash, invite_type, invited_role,
          created_by_member_id, expires_at, max_uses, use_count, created_at, updated_at)
        VALUES ('i1', 'h1', 'token-hash', 'code-hash', 'household', 'adult', 'owner', 'later', 10, 0, 'now', 'now');
      INSERT INTO task_suggestions
        (id, household_id, suggested_by_member_id, room_id, title, suggestion_type, status, client_key, created_at, updated_at)
        VALUES ('suggestion', 'h1', 'owner', 'r1', 'Clean cupboard', 'one_off', 'open', 'client-one', 'now', 'now');
    `);
    expect(sqlite("SELECT count(*) FROM task_suggestions;").trim()).toBe("1");
    expect(sqlite("SELECT count(*) FROM household_systems;").trim()).toBe("0");
    expect(sqlite("SELECT count(*) FROM household_task_instances;").trim()).toBe("0");
    expect(sqlite("PRAGMA foreign_key_check;")).toBe("");
  });
});
