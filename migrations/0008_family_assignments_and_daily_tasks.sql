PRAGMA foreign_keys = ON;

-- Canonical family access and age concepts. Historical `role`, `age_group` and
-- `relationship_label` columns remain for backwards compatibility only.
ALTER TABLE members ADD COLUMN access_level TEXT NOT NULL DEFAULT 'household_member'
  CHECK(access_level IN ('household_admin', 'household_member', 'managed_member'));
ALTER TABLE members ADD COLUMN age_band TEXT NOT NULL DEFAULT 'adult'
  CHECK(age_band IN ('adult', 'teen', 'child', 'young_child'));

UPDATE members
SET access_level = CASE
    WHEN role IN ('owner', 'parent_admin') THEN 'household_admin'
    WHEN role = 'child'
      OR lifecycle_state = 'managed'
      OR age_group IN ('teen', 'child', 'dependent') THEN 'managed_member'
    ELSE 'household_member'
  END,
  age_band = CASE age_group
    WHEN 'teen' THEN 'teen'
    WHEN 'child' THEN 'child'
    WHEN 'dependent' THEN 'young_child'
    ELSE 'adult'
  END;

CREATE INDEX members_household_access_idx
  ON members(household_id, is_active, access_level, age_band, created_at);

ALTER TABLE household_invites ADD COLUMN invited_access_level TEXT
  CHECK(invited_access_level IS NULL OR invited_access_level IN (
    'household_admin', 'household_member', 'managed_member'
  ));
ALTER TABLE household_invites ADD COLUMN invited_age_band TEXT
  CHECK(invited_age_band IS NULL OR invited_age_band IN ('adult', 'teen', 'child', 'young_child'));

UPDATE household_invites
SET invited_access_level = CASE invited_role
    WHEN 'parent_admin' THEN 'household_admin'
    WHEN 'child' THEN 'managed_member'
    WHEN 'adult' THEN 'household_member'
    ELSE NULL
  END,
  invited_age_band = CASE invited_role
    WHEN 'child' THEN 'child'
    WHEN 'parent_admin' THEN 'adult'
    WHEN 'adult' THEN 'adult'
    ELSE NULL
  END;

-- Optional room occupancy is deliberately a small join table on the existing
-- room editor, not a second room-management model.
CREATE TABLE room_occupants (
  household_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, room_id, member_id),
  FOREIGN KEY (household_id, room_id) REFERENCES rooms(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE INDEX room_occupants_member_idx
  ON room_occupants(household_id, member_id, room_id);

-- Canonical assignment ownership. `owner_member_id` and `rotation_enabled` on
-- household_systems are retained as historical compatibility fields, but task
-- derivation reads this table.
CREATE TABLE routine_assignments (
  household_id TEXT NOT NULL,
  system_id TEXT NOT NULL,
  assignment_mode TEXT NOT NULL
    CHECK(assignment_mode IN ('rotation', 'one_person', 'shared_team', 'decide_later')),
  assigned_member_id TEXT,
  rotation_next_index INTEGER NOT NULL DEFAULT 0 CHECK(rotation_next_index >= 0),
  previous_assignee_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, system_id),
  FOREIGN KEY (household_id, system_id)
    REFERENCES household_systems(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, assigned_member_id)
    REFERENCES members(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, previous_assignee_id)
    REFERENCES members(household_id, id) ON DELETE RESTRICT,
  CHECK(
    (assignment_mode = 'one_person' AND assigned_member_id IS NOT NULL)
    OR (assignment_mode != 'one_person' AND assigned_member_id IS NULL)
  )
);

CREATE TABLE routine_assignment_participants (
  household_id TEXT NOT NULL,
  system_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  participant_order INTEGER NOT NULL CHECK(participant_order >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, system_id, member_id),
  FOREIGN KEY (household_id, system_id)
    REFERENCES routine_assignments(household_id, system_id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, member_id)
    REFERENCES members(household_id, id) ON DELETE RESTRICT,
  UNIQUE (household_id, system_id, participant_order)
);

INSERT INTO routine_assignments (
  household_id, system_id, assignment_mode, assigned_member_id,
  rotation_next_index, previous_assignee_id, created_at, updated_at
)
SELECT household_id, id,
  CASE WHEN rotation_enabled = 1 THEN 'rotation' ELSE 'one_person' END,
  CASE WHEN rotation_enabled = 1 THEN NULL ELSE owner_member_id END,
  0, NULL, created_at, updated_at
FROM household_systems;

INSERT INTO routine_assignment_participants (
  household_id, system_id, member_id, participant_order, created_at
)
SELECT household_id, system_id, member_id,
  ROW_NUMBER() OVER (
    PARTITION BY household_id, system_id ORDER BY created_at, member_id
  ) - 1,
  created_at
FROM household_system_participants;

CREATE INDEX routine_assignment_participants_member_idx
  ON routine_assignment_participants(household_id, member_id, system_id);

CREATE TABLE household_task_instances (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  system_id TEXT NOT NULL,
  occurrence_date TEXT NOT NULL CHECK(length(occurrence_date) = 10),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  room_id TEXT,
  pet_id TEXT,
  assignment_mode TEXT NOT NULL
    CHECK(assignment_mode IN ('rotation', 'one_person', 'shared_team', 'decide_later', 'manual')),
  assigned_member_id TEXT,
  rotation_index INTEGER CHECK(rotation_index IS NULL OR rotation_index >= 0),
  due_period TEXT NOT NULL DEFAULT 'anytime'
    CHECK(due_period IN ('morning', 'afternoon', 'evening', 'anytime')),
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK(status IN ('todo', 'in_progress', 'waiting_for_team', 'complete', 'missed')),
  completed_at TEXT,
  completed_by_member_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, system_id)
    REFERENCES household_systems(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, room_id) REFERENCES rooms(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, pet_id) REFERENCES pets(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, assigned_member_id)
    REFERENCES members(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, completed_by_member_id)
    REFERENCES members(household_id, id) ON DELETE RESTRICT,
  UNIQUE (household_id, system_id, occurrence_date)
);

CREATE INDEX household_tasks_day_idx
  ON household_task_instances(household_id, occurrence_date, status, created_at);
CREATE INDEX household_tasks_member_idx
  ON household_task_instances(household_id, assigned_member_id, occurrence_date, status);

CREATE TABLE household_task_participants (
  household_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  participant_kind TEXT NOT NULL DEFAULT 'required'
    CHECK(participant_kind IN ('required', 'helper')),
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK(status IN ('todo', 'in_progress', 'complete', 'missed')),
  completed_at TEXT,
  completed_by_member_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, task_id, member_id),
  FOREIGN KEY (household_id, task_id)
    REFERENCES household_task_instances(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, member_id)
    REFERENCES members(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, completed_by_member_id)
    REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE INDEX household_task_participants_member_idx
  ON household_task_participants(household_id, member_id, status, task_id);

CREATE TABLE routine_assignment_history (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  system_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  member_id TEXT,
  assignment_mode TEXT NOT NULL,
  rotation_index INTEGER,
  occurrence_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, system_id)
    REFERENCES household_systems(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, task_id)
    REFERENCES household_task_instances(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, member_id)
    REFERENCES members(household_id, id) ON DELETE RESTRICT,
  UNIQUE (household_id, task_id)
);

CREATE INDEX routine_assignment_history_system_idx
  ON routine_assignment_history(household_id, system_id, occurrence_date);

CREATE TABLE task_help_requests (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  requested_by_member_id TEXT NOT NULL,
  helper_member_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK(status IN ('requested', 'accepted', 'completed', 'cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, task_id)
    REFERENCES household_task_instances(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, requested_by_member_id)
    REFERENCES members(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, helper_member_id)
    REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX task_help_requests_open_idx
  ON task_help_requests(household_id, task_id, helper_member_id)
  WHERE status IN ('requested', 'accepted');
CREATE INDEX task_help_requests_helper_idx
  ON task_help_requests(household_id, helper_member_id, status, created_at);
