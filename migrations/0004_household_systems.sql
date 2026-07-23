PRAGMA foreign_keys = ON;

ALTER TABLE rooms ADD COLUMN room_type TEXT NOT NULL DEFAULT 'other'
  CHECK(room_type IN (
    'kitchen','bathroom','toilet','living_room','bedroom','child_bedroom',
    'hallway','laundry','dining_room','home_office','garden','other'
  ));

CREATE TABLE household_systems (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  purpose TEXT NOT NULL CHECK(length(trim(purpose)) BETWEEN 1 AND 1000),
  room_id TEXT,
  pet_id TEXT,
  owner_member_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'paused', 'archived')),
  frequency_key TEXT NOT NULL CHECK(frequency_key IN (
    'daily','weekdays','weekends','twice_weekly','three_weekly',
    'weekly','fortnightly','monthly','as_needed','custom'
  )),
  custom_frequency_note TEXT CHECK(custom_frequency_note IS NULL OR length(custom_frequency_note) <= 300),
  rotation_enabled INTEGER NOT NULL DEFAULT 0 CHECK(rotation_enabled IN (0, 1)),
  estimated_minutes INTEGER NOT NULL DEFAULT 15 CHECK(estimated_minutes BETWEEN 1 AND 1440),
  definition_of_done TEXT NOT NULL CHECK(length(trim(definition_of_done)) BETWEEN 1 AND 1000),
  notes TEXT CHECK(notes IS NULL OR length(notes) <= 1000),
  display_order INTEGER NOT NULL CHECK(display_order >= 0),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('template', 'custom')),
  source_template_key TEXT,
  source_template_version INTEGER,
  template_customised INTEGER NOT NULL DEFAULT 0 CHECK(template_customised IN (0, 1)),
  client_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, room_id) REFERENCES rooms(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, pet_id) REFERENCES pets(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, owner_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT,
  CHECK((source_kind = 'template' AND source_template_key IS NOT NULL AND source_template_version IS NOT NULL)
    OR (source_kind = 'custom' AND source_template_key IS NULL AND source_template_version IS NULL))
);

CREATE UNIQUE INDEX household_systems_template_context_idx
  ON household_systems (
    household_id,
    source_template_key,
    ifnull(room_id, ''),
    ifnull(pet_id, '')
  ) WHERE source_template_key IS NOT NULL AND status != 'archived';
CREATE UNIQUE INDEX household_systems_client_key_idx
  ON household_systems (household_id, client_key)
  WHERE client_key IS NOT NULL AND status != 'archived';
CREATE INDEX household_systems_library_idx
  ON household_systems (household_id, status, display_order, created_at);

CREATE TABLE household_system_steps (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  system_id TEXT NOT NULL,
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 300),
  display_order INTEGER NOT NULL CHECK(display_order >= 0),
  is_required INTEGER NOT NULL DEFAULT 1 CHECK(is_required IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, system_id, id),
  FOREIGN KEY (household_id, system_id) REFERENCES household_systems(household_id, id) ON DELETE RESTRICT,
  UNIQUE (household_id, system_id, display_order)
);

CREATE TABLE household_system_participants (
  household_id TEXT NOT NULL,
  system_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, system_id, member_id),
  FOREIGN KEY (household_id, system_id) REFERENCES household_systems(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE INDEX household_system_steps_order_idx
  ON household_system_steps (household_id, system_id, display_order);
CREATE INDEX household_system_participants_member_idx
  ON household_system_participants (household_id, member_id, system_id);
