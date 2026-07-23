PRAGMA foreign_keys = ON;

CREATE TABLE households (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX households_name_created_idx
  ON households (name, created_at);

CREATE TABLE members (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  display_name TEXT NOT NULL CHECK(length(trim(display_name)) BETWEEN 1 AND 80),
  role TEXT NOT NULL CHECK(role IN ('owner', 'parent_admin', 'adult', 'child')),
  pin_hash TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX members_household_display_name_idx
  ON members (household_id, lower(display_name));

CREATE INDEX members_household_role_idx
  ON members (household_id, role, is_active);

CREATE TABLE sessions (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX sessions_token_hash_idx
  ON sessions (token_hash);

CREATE INDEX sessions_member_active_idx
  ON sessions (household_id, member_id, expires_at);

CREATE TABLE invitation_codes (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  invited_role TEXT NOT NULL DEFAULT 'adult' CHECK(invited_role IN ('parent_admin', 'adult', 'child')),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK(max_uses > 0),
  use_count INTEGER NOT NULL DEFAULT 0 CHECK(use_count >= 0 AND use_count <= max_uses),
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, created_by) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX invitation_codes_code_hash_idx
  ON invitation_codes (code_hash);

CREATE INDEX invitation_codes_household_active_idx
  ON invitation_codes (household_id, expires_at, use_count);
