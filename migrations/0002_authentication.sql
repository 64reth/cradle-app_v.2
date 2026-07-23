PRAGMA foreign_keys = ON;

ALTER TABLE households ADD COLUMN lookup_reference TEXT;
ALTER TABLE members ADD COLUMN profile_reference TEXT;
ALTER TABLE members ADD COLUMN pin_salt TEXT;
ALTER TABLE sessions ADD COLUMN revoked_at TEXT;
ALTER TABLE invitation_codes ADD COLUMN redeemed_at TEXT;
ALTER TABLE invitation_codes ADD COLUMN redeemed_by TEXT;
ALTER TABLE invitation_codes ADD COLUMN revoked_at TEXT;

CREATE UNIQUE INDEX households_lookup_reference_idx
  ON households (lower(lookup_reference))
  WHERE lookup_reference IS NOT NULL;

CREATE UNIQUE INDEX members_household_profile_reference_idx
  ON members (household_id, lower(profile_reference))
  WHERE profile_reference IS NOT NULL;

CREATE INDEX sessions_authentication_idx
  ON sessions (token_hash, expires_at, revoked_at);

CREATE INDEX invitation_codes_redemption_idx
  ON invitation_codes (code_hash, expires_at, redeemed_at, revoked_at);

CREATE TABLE authentication_attempts (
  throttle_key TEXT PRIMARY KEY NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK(failure_count >= 0),
  window_started_at TEXT NOT NULL,
  blocked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX authentication_attempts_blocked_idx
  ON authentication_attempts (blocked_until);
