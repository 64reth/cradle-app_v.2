PRAGMA foreign_keys = ON;

CREATE TABLE account_security (
  account_id TEXT PRIMARY KEY NOT NULL,
  account_status TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active', 'suspended', 'closed')),
  mfa_enabled INTEGER NOT NULL DEFAULT 0 CHECK(mfa_enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES user_accounts(id) ON DELETE RESTRICT
);
INSERT OR IGNORE INTO account_security (account_id, created_at, updated_at)
  SELECT id, created_at, updated_at FROM user_accounts;

CREATE TABLE session_metadata (
  household_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  auth_method TEXT NOT NULL DEFAULT 'legacy_pin' CHECK(auth_method IN ('legacy_pin', 'google', 'apple', 'email_otp')),
  device_label TEXT,
  last_seen_at TEXT,
  user_agent_hash TEXT,
  PRIMARY KEY (household_id, session_id),
  FOREIGN KEY (household_id, session_id) REFERENCES sessions(household_id, id) ON DELETE CASCADE
);

CREATE TABLE profiles (
  account_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES user_accounts(id) ON DELETE RESTRICT
);

INSERT OR IGNORE INTO profiles (account_id, display_name, created_at, updated_at)
  SELECT id, display_name, created_at, updated_at FROM user_accounts;

CREATE TABLE profile_preferences (
  account_id TEXT PRIMARY KEY NOT NULL,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES profiles(account_id) ON DELETE RESTRICT
);

CREATE TABLE auth_identities (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('google', 'apple', 'email')),
  provider_subject TEXT NOT NULL CHECK(length(trim(provider_subject)) BETWEEN 1 AND 255),
  email TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES user_accounts(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX auth_identities_provider_subject_idx
  ON auth_identities(provider, provider_subject);
CREATE UNIQUE INDEX auth_identities_account_provider_idx
  ON auth_identities(account_id, provider);
CREATE INDEX auth_identities_account_idx ON auth_identities(account_id, last_seen_at);

CREATE TABLE identity_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES user_accounts(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX identity_sessions_token_idx ON identity_sessions(token_hash);
CREATE INDEX identity_sessions_account_idx ON identity_sessions(account_id, expires_at, revoked_at);

CREATE TABLE platform_operators (
  account_id TEXT PRIMARY KEY NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES user_accounts(id) ON DELETE RESTRICT
);

CREATE TABLE auth_events (
  id TEXT PRIMARY KEY NOT NULL,
  account_id TEXT,
  household_id TEXT,
  member_id TEXT,
  event_name TEXT NOT NULL CHECK(event_name IN
    ('login_success', 'login_failure', 'provider_login', 'logout', 'session_revoked', 'invitation_accepted', 'role_assigned', 'otp_requested')),
  provider TEXT CHECK(provider IS NULL OR provider IN ('legacy_pin', 'google', 'apple', 'email_otp')),
  result TEXT NOT NULL CHECK(result IN ('success', 'failure')),
  safe_code TEXT,
  request_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (account_id) REFERENCES user_accounts(id) ON DELETE SET NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE SET NULL,
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE SET NULL
);
CREATE INDEX auth_events_account_created_idx ON auth_events(account_id, created_at DESC);
CREATE INDEX auth_events_household_created_idx ON auth_events(household_id, created_at DESC);

CREATE TABLE platform_audit_log (
  id TEXT PRIMARY KEY NOT NULL,
  operator_account_id TEXT NOT NULL,
  target_account_id TEXT,
  action TEXT NOT NULL CHECK(length(trim(action)) BETWEEN 1 AND 80),
  result TEXT NOT NULL CHECK(result IN ('success', 'failure')),
  reason TEXT CHECK(reason IS NULL OR length(trim(reason)) <= 500),
  request_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (operator_account_id) REFERENCES user_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (target_account_id) REFERENCES user_accounts(id) ON DELETE SET NULL
);
CREATE INDEX platform_audit_target_created_idx ON platform_audit_log(target_account_id, created_at DESC);
CREATE TRIGGER platform_audit_log_immutable_update
BEFORE UPDATE ON platform_audit_log BEGIN
  SELECT RAISE(ABORT, 'platform audit records are immutable');
END;
CREATE TRIGGER platform_audit_log_immutable_delete
BEFORE DELETE ON platform_audit_log BEGIN
  SELECT RAISE(ABORT, 'platform audit records are immutable');
END;
