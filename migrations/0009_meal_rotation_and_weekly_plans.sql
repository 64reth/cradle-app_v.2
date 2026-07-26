PRAGMA foreign_keys = ON;

-- Recipe Bank: household meals and safe, member-owned favourites. A favourite
-- may be linked to a meal or remain a simple custom name until the household
-- chooses to consolidate similar entries.
CREATE TABLE meals (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),
  description TEXT,
  dietary_tags TEXT,
  allergens TEXT,
  source_kind TEXT NOT NULL DEFAULT 'custom' CHECK(source_kind IN ('recipe', 'custom')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT
);

CREATE INDEX meals_household_active_idx ON meals(household_id, is_active, name);

CREATE TABLE member_meal_preferences (
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  dietary_requirements TEXT,
  allergies TEXT,
  dislikes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, member_id),
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE CASCADE
);

CREATE INDEX member_meal_preferences_household_idx ON member_meal_preferences(household_id, member_id);

CREATE TABLE meal_favourites (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  meal_id TEXT,
  custom_meal_name TEXT,
  priority INTEGER NOT NULL DEFAULT 0 CHECK(priority BETWEEN 0 AND 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, meal_id) REFERENCES meals(household_id, id) ON DELETE RESTRICT,
  CHECK((meal_id IS NOT NULL AND custom_meal_name IS NULL) OR
    (meal_id IS NULL AND length(trim(custom_meal_name)) BETWEEN 1 AND 160))
);

CREATE INDEX meal_favourites_member_idx ON meal_favourites(household_id, member_id, priority, created_at);
CREATE INDEX meal_favourites_meal_idx ON meal_favourites(household_id, meal_id, priority);

-- Reusable 7x4 dinner rhythm. Slots deliberately allow additional meal types
-- later; the initial builder writes dinner for all seven days of each week.
CREATE TABLE meal_rotations (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  description TEXT,
  cycle_length_weeks INTEGER NOT NULL DEFAULT 4 CHECK(cycle_length_weeks BETWEEN 1 AND 4),
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1)),
  starts_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT
);

CREATE INDEX meal_rotations_household_active_idx ON meal_rotations(household_id, active, created_at);

CREATE TABLE meal_rotation_slots (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  meal_rotation_id TEXT NOT NULL,
  rotation_week_number INTEGER NOT NULL CHECK(rotation_week_number BETWEEN 1 AND 4),
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
  meal_type TEXT NOT NULL DEFAULT 'dinner',
  meal_id TEXT,
  custom_meal_name TEXT,
  slot_kind TEXT NOT NULL DEFAULT 'meal'
    CHECK(slot_kind IN ('meal', 'leftovers', 'eating_out', 'takeaway', 'flexible', 'special_theme')),
  day_theme TEXT,
  assigned_cook_member_id TEXT,
  assignment_mode TEXT NOT NULL DEFAULT 'decide_later'
    CHECK(assignment_mode IN ('rotation', 'one_person', 'shared_team', 'decide_later')),
  notes TEXT,
  sort_position INTEGER NOT NULL DEFAULT 0 CHECK(sort_position >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, meal_rotation_id) REFERENCES meal_rotations(household_id, id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, meal_id) REFERENCES meals(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, assigned_cook_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT,
  UNIQUE (household_id, meal_rotation_id, rotation_week_number, day_of_week, meal_type)
);

CREATE INDEX meal_rotation_slots_lookup_idx
  ON meal_rotation_slots(household_id, meal_rotation_id, rotation_week_number, day_of_week, meal_type);

-- The operational calendar. A plan is generated from a rotation but owns its
-- own slots so an override never silently rewrites the reusable rhythm.
CREATE TABLE weekly_meal_plans (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  week_start TEXT NOT NULL CHECK(length(week_start) = 10),
  source_rotation_id TEXT,
  rotation_week_number INTEGER CHECK(rotation_week_number IS NULL OR rotation_week_number BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, source_rotation_id) REFERENCES meal_rotations(household_id, id) ON DELETE RESTRICT,
  UNIQUE (household_id, week_start)
);

CREATE INDEX weekly_meal_plans_household_date_idx ON weekly_meal_plans(household_id, week_start, status);

CREATE TABLE weekly_meal_plan_slots (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  weekly_meal_plan_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 1 AND 7),
  meal_type TEXT NOT NULL,
  meal_id TEXT,
  custom_meal_name TEXT,
  slot_kind TEXT NOT NULL DEFAULT 'flexible'
    CHECK(slot_kind IN ('meal', 'leftovers', 'eating_out', 'takeaway', 'flexible', 'special_theme')),
  day_theme TEXT,
  source_rotation_slot_id TEXT,
  override_kind TEXT NOT NULL DEFAULT 'none'
    CHECK(override_kind IN ('none', 'this_week', 'special_occasion')),
  special_occasion_title TEXT,
  assigned_cook_member_id TEXT,
  assignment_mode TEXT NOT NULL DEFAULT 'decide_later'
    CHECK(assignment_mode IN ('rotation', 'one_person', 'shared_team', 'decide_later')),
  notes TEXT,
  sort_position INTEGER NOT NULL DEFAULT 0 CHECK(sort_position >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, weekly_meal_plan_id) REFERENCES weekly_meal_plans(household_id, id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, meal_id) REFERENCES meals(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, source_rotation_slot_id) REFERENCES meal_rotation_slots(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, assigned_cook_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT,
  UNIQUE (household_id, weekly_meal_plan_id, day_of_week, meal_type)
);

CREATE INDEX weekly_meal_plan_slots_lookup_idx
  ON weekly_meal_plan_slots(household_id, weekly_meal_plan_id, day_of_week, meal_type);

-- Shopping lists are derived from the actual weekly plan, never directly from
-- the reusable rotation. Ingredient rows are optional until a recipe is known.
CREATE TABLE meal_ingredients (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  meal_id TEXT NOT NULL,
  ingredient_name TEXT NOT NULL CHECK(length(trim(ingredient_name)) BETWEEN 1 AND 160),
  quantity TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, meal_id) REFERENCES meals(household_id, id) ON DELETE CASCADE
);

CREATE TABLE meal_shopping_lists (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  weekly_meal_plan_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, weekly_meal_plan_id) REFERENCES weekly_meal_plans(household_id, id) ON DELETE CASCADE,
  UNIQUE (household_id, weekly_meal_plan_id)
);

CREATE TABLE meal_shopping_list_items (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  shopping_list_id TEXT NOT NULL,
  ingredient_name TEXT NOT NULL CHECK(length(trim(ingredient_name)) BETWEEN 1 AND 160),
  quantity TEXT,
  is_checked INTEGER NOT NULL DEFAULT 0 CHECK(is_checked IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, shopping_list_id) REFERENCES meal_shopping_lists(household_id, id) ON DELETE CASCADE
);
