PRAGMA foreign_keys = ON;

CREATE TABLE user_accounts (
  id TEXT PRIMARY KEY NOT NULL,
  account_reference TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 80),
  pin_hash TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX user_accounts_reference_idx ON user_accounts(lower(account_reference));

ALTER TABLE members ADD COLUMN account_id TEXT REFERENCES user_accounts(id) ON DELETE RESTRICT;
ALTER TABLE members ADD COLUMN lifecycle_state TEXT NOT NULL DEFAULT 'active'
  CHECK(lifecycle_state IN ('managed','unclaimed','invited','join_requested','active','suspended','left'));
ALTER TABLE members ADD COLUMN age_group TEXT
  CHECK(age_group IS NULL OR age_group IN ('adult','teen','child','dependent'));
ALTER TABLE members ADD COLUMN preferred_name TEXT
  CHECK(preferred_name IS NULL OR length(trim(preferred_name)) BETWEEN 1 AND 80);
ALTER TABLE members ADD COLUMN relationship_label TEXT
  CHECK(relationship_label IS NULL OR length(trim(relationship_label)) <= 80);
ALTER TABLE members ADD COLUMN client_key TEXT;
ALTER TABLE sessions ADD COLUMN account_id TEXT REFERENCES user_accounts(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX members_household_account_idx
  ON members(household_id, account_id) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX members_household_client_key_idx
  ON members(household_id, client_key) WHERE client_key IS NOT NULL;
CREATE INDEX members_household_lifecycle_idx
  ON members(household_id, lifecycle_state, role, created_at);

CREATE TABLE household_invites (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  target_member_id TEXT,
  token_hash TEXT NOT NULL,
  short_code_hash TEXT NOT NULL,
  invite_type TEXT NOT NULL CHECK(invite_type IN ('profile','household')),
  invited_role TEXT CHECK(invited_role IS NULL OR invited_role IN ('parent_admin','adult','child')),
  created_by_member_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK(max_uses BETWEEN 1 AND 20),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK(use_count >= 0 AND use_count <= max_uses),
  revoked_at TEXT,
  accepted_at TEXT,
  accepted_account_id TEXT REFERENCES user_accounts(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, target_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, created_by_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX household_invites_token_idx ON household_invites(token_hash);
CREATE UNIQUE INDEX household_invites_code_idx ON household_invites(short_code_hash);
CREATE UNIQUE INDEX household_invites_live_profile_idx
  ON household_invites(household_id, target_member_id)
  WHERE target_member_id IS NOT NULL AND revoked_at IS NULL AND accepted_at IS NULL;
CREATE INDEX household_invites_household_state_idx
  ON household_invites(household_id, revoked_at, accepted_at, expires_at, created_at);

CREATE TABLE household_join_requests (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  invite_id TEXT NOT NULL,
  requested_member_id TEXT,
  proposed_display_name TEXT
    CHECK(proposed_display_name IS NULL OR length(trim(proposed_display_name)) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined')),
  reviewed_by_member_id TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  FOREIGN KEY (account_id) REFERENCES user_accounts(id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, invite_id) REFERENCES household_invites(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, requested_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, reviewed_by_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX household_join_requests_pending_account_idx
  ON household_join_requests(household_id, account_id) WHERE status = 'pending';
CREATE INDEX household_join_requests_household_status_idx
  ON household_join_requests(household_id, status, created_at);

CREATE TABLE member_companions (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  fur_palette_key TEXT NOT NULL,
  patch_primary_palette_key TEXT NOT NULL,
  patch_secondary_palette_key TEXT NOT NULL,
  expression_key TEXT NOT NULL DEFAULT 'neutral'
    CHECK(expression_key IN ('neutral','on_track','completed','calm','behind','needs_help')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX member_companions_active_member_idx
  ON member_companions(household_id, member_id) WHERE is_active = 1;

CREATE TABLE task_suggestions (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  suggested_by_member_id TEXT NOT NULL,
  room_id TEXT,
  pet_id TEXT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  suggestion_type TEXT NOT NULL CHECK(suggestion_type IN ('one_off','recurring')),
  note TEXT CHECK(note IS NULL OR length(note) <= 1000),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','declined','withdrawn')),
  client_key TEXT NOT NULL,
  reviewed_by_member_id TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, suggested_by_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, room_id) REFERENCES rooms(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, pet_id) REFERENCES pets(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, reviewed_by_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT,
  CHECK(NOT (room_id IS NOT NULL AND pet_id IS NOT NULL))
);

CREATE UNIQUE INDEX task_suggestions_member_client_idx
  ON task_suggestions(household_id, suggested_by_member_id, client_key);
CREATE INDEX task_suggestions_household_status_idx
  ON task_suggestions(household_id, status, created_at);
