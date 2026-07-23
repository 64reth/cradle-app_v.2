PRAGMA foreign_keys = ON;

ALTER TABLE households ADD COLUMN setup_status TEXT NOT NULL DEFAULT 'incomplete'
  CHECK(setup_status IN ('incomplete', 'complete'));
ALTER TABLE households ADD COLUMN setup_step TEXT NOT NULL DEFAULT 'leadership'
  CHECK(setup_step IN ('leadership', 'members', 'rooms', 'pets', 'companion', 'review', 'complete'));
ALTER TABLE households ADD COLUMN leadership_confirmed_at TEXT;
ALTER TABLE households ADD COLUMN membership_reviewed_at TEXT;
ALTER TABLE households ADD COLUMN setup_completed_at TEXT;

CREATE INDEX households_setup_state_idx ON households (setup_status, setup_step);

CREATE TABLE rooms (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  description TEXT CHECK(description IS NULL OR length(description) <= 500),
  display_order INTEGER NOT NULL CHECK(display_order >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX rooms_household_active_name_idx
  ON rooms (household_id, lower(name)) WHERE is_active = 1;
CREATE INDEX rooms_household_order_idx
  ON rooms (household_id, is_active, display_order, created_at);

CREATE TABLE pets (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 80),
  pet_type TEXT NOT NULL CHECK(pet_type IN
    ('dog','cat','fish','bird','rabbit','hamster','guinea_pig','reptile','tortoise','horse','chicken','other')),
  breed TEXT CHECK(breed IS NULL OR length(breed) <= 120),
  notes TEXT CHECK(notes IS NULL OR length(notes) <= 1000),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT
);

CREATE INDEX pets_household_active_idx
  ON pets (household_id, is_active, created_at);

CREATE TABLE companions (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
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
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX companions_household_active_idx
  ON companions (household_id) WHERE is_active = 1;
