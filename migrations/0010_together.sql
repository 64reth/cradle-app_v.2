PRAGMA foreign_keys = ON;

-- Together keeps shared connection separate from household routines. System
-- templates use a NULL household_id; household-authored templates are scoped.
CREATE TABLE together_moment_templates (
  id TEXT PRIMARY KEY,
  household_id TEXT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 1000),
  category TEXT NOT NULL,
  moment_type TEXT NOT NULL CHECK(moment_type IN ('whole_family','one_to_one','spotlight','skill_sharing','conversation','creative','active','learning','food','music','games','outdoors','low_energy')),
  min_participants INTEGER NOT NULL DEFAULT 1 CHECK(min_participants >= 1),
  max_participants INTEGER NOT NULL DEFAULT 99 CHECK(max_participants >= min_participants),
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK(duration_minutes BETWEEN 5 AND 480),
  indoor_outdoor TEXT NOT NULL DEFAULT 'either' CHECK(indoor_outdoor IN ('indoor','outdoor','either')),
  screen_mode TEXT NOT NULL DEFAULT 'off_screen' CHECK(screen_mode IN ('off_screen','screen_shared','either')),
  energy_level TEXT NOT NULL DEFAULT 'medium' CHECK(energy_level IN ('low','medium','high')),
  equipment_json TEXT,
  minimum_age_band TEXT CHECK(minimum_age_band IS NULL OR minimum_age_band IN ('adult','teen','child','young_child')),
  supervision_requirement TEXT,
  source TEXT NOT NULL DEFAULT 'system' CHECK(source IN ('system','household')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE INDEX together_templates_scope_idx ON together_moment_templates(household_id, is_active, category, moment_type);

CREATE TABLE together_member_preferences (
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  interests_json TEXT,
  skills_to_share_json TEXT,
  skills_to_learn_json TEXT,
  preferred_energy TEXT CHECK(preferred_energy IS NULL OR preferred_energy IN ('low','medium','high','any')),
  screen_preference TEXT CHECK(screen_preference IS NULL OR screen_preference IN ('prefer_off_screen','balanced','screen_ok')),
  excluded_categories_json TEXT,
  unavailable_json TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, member_id),
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE CASCADE
);

CREATE TABLE together_daily_moments (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  local_date TEXT NOT NULL CHECK(length(local_date) = 10),
  template_id TEXT,
  title_snapshot TEXT NOT NULL CHECK(length(trim(title_snapshot)) BETWEEN 1 AND 160),
  description_snapshot TEXT NOT NULL CHECK(length(trim(description_snapshot)) BETWEEN 1 AND 1000),
  moment_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'suggested' CHECK(status IN ('suggested','viewed','accepted','started','completed','skipped','swapped','saved_for_later','cancelled')),
  is_primary INTEGER NOT NULL DEFAULT 1 CHECK(is_primary IN (0,1)),
  generated_reason TEXT NOT NULL DEFAULT 'daily',
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 5 AND 480),
  indoor_outdoor TEXT NOT NULL DEFAULT 'either',
  screen_mode TEXT NOT NULL DEFAULT 'off_screen',
  category TEXT NOT NULL,
  equipment_json TEXT,
  created_by_member_id TEXT,
  generated_at TEXT NOT NULL,
  viewed_at TEXT,
  accepted_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  skipped_at TEXT,
  swapped_from_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (template_id) REFERENCES together_moment_templates(id) ON DELETE SET NULL,
  FOREIGN KEY (household_id, created_by_member_id) REFERENCES members(household_id, id) ON DELETE SET NULL,
  FOREIGN KEY (household_id, swapped_from_id) REFERENCES together_daily_moments(household_id, id) ON DELETE SET NULL
);

-- System template references are intentionally nullable because system rows
-- have no household_id. The service validates template ownership before use.
CREATE INDEX together_daily_lookup_idx ON together_daily_moments(household_id, local_date, status, is_primary);
CREATE UNIQUE INDEX together_primary_day_idx ON together_daily_moments(household_id, local_date) WHERE is_primary = 1;
CREATE UNIQUE INDEX together_secondary_day_idx ON together_daily_moments(household_id, local_date) WHERE is_primary = 0;

CREATE TABLE together_moment_participants (
  household_id TEXT NOT NULL,
  moment_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  participant_role TEXT NOT NULL DEFAULT 'participant' CHECK(participant_role IN ('participant','spotlight','guide','helper','supervisor')),
  supervision_role TEXT,
  participation_status TEXT NOT NULL DEFAULT 'invited' CHECK(participation_status IN ('invited','accepted','declined','completed')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, moment_id, member_id),
  FOREIGN KEY (household_id, moment_id) REFERENCES together_daily_moments(household_id, id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE INDEX together_participants_member_idx ON together_moment_participants(household_id, member_id, created_at);

CREATE TABLE together_moment_history (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  moment_id TEXT NOT NULL,
  member_id TEXT,
  event_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, moment_id) REFERENCES together_daily_moments(household_id, id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE SET NULL
);

CREATE TABLE together_traditions (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
  description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 1000),
  recurrence TEXT NOT NULL DEFAULT 'occasional',
  preferred_day INTEGER CHECK(preferred_day IS NULL OR preferred_day BETWEEN 0 AND 6),
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK(duration_minutes BETWEEN 5 AND 480),
  category TEXT NOT NULL,
  indoor_outdoor TEXT NOT NULL DEFAULT 'either',
  screen_mode TEXT NOT NULL DEFAULT 'off_screen',
  equipment_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, created_by_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE INDEX together_traditions_active_idx ON together_traditions(household_id, is_active, preferred_day);

CREATE TABLE together_tradition_participants (
  household_id TEXT NOT NULL,
  tradition_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, tradition_id, member_id),
  FOREIGN KEY (household_id, tradition_id) REFERENCES together_traditions(household_id, id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE TABLE together_memories (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  moment_id TEXT NOT NULL,
  note TEXT CHECK(note IS NULL OR length(trim(note)) <= 1000),
  actual_duration_minutes INTEGER CHECK(actual_duration_minutes IS NULL OR actual_duration_minutes BETWEEN 1 AND 480),
  would_repeat INTEGER CHECK(would_repeat IS NULL OR would_repeat IN (0,1)),
  created_by_member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id, moment_id) REFERENCES together_daily_moments(household_id, id) ON DELETE CASCADE,
  FOREIGN KEY (household_id, created_by_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE INDEX together_memories_household_idx ON together_memories(household_id, created_at);

INSERT INTO together_moment_templates
  (id, household_id, title, description, category, moment_type, min_participants, max_participants,
   duration_minutes, indoor_outdoor, screen_mode, energy_level, source, created_at, updated_at)
VALUES
  ('system-family-charades', NULL, 'Play family charades', 'Choose a few familiar things and act them out for everyone.', 'games', 'whole_family', 2, 99, 30, 'indoor', 'off_screen', 'medium', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-family-quiz', NULL, 'Make a family quiz', 'Take turns writing questions that everyone can enjoy answering.', 'learning', 'whole_family', 2, 99, 45, 'indoor', 'off_screen', 'medium', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-family-walk', NULL, 'Take a family walk', 'Take a short walk together and let the youngest participant choose the safe route.', 'outdoors', 'whole_family', 2, 99, 30, 'outdoor', 'off_screen', 'medium', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-cook-together', NULL, 'Make something together', 'Choose a simple meal or snack and share the preparation.', 'food', 'whole_family', 2, 99, 45, 'indoor', 'off_screen', 'medium', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-family-film', NULL, 'Family film night', 'Choose one film everyone can enjoy and make space for shared attention.', 'film', 'whole_family', 2, 99, 120, 'indoor', 'screen_shared', 'low', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-memory-photo', NULL, 'Share an old photograph', 'Choose a family photograph and let each person share what they remember.', 'conversation', 'conversation', 2, 99, 20, 'indoor', 'screen_shared', 'low', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-one-to-one-skill', NULL, 'Teach one another a skill', 'One person teaches another something they enjoy, with a grown-up nearby when needed.', 'learning', 'one_to_one', 2, 2, 30, 'either', 'either', 'medium', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-one-to-one-music', NULL, 'Share three songs', 'Choose three songs and explain why they matter to you.', 'music', 'one_to_one', 2, 2, 25, 'indoor', 'screen_shared', 'low', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-spotlight-show', NULL, 'Family show-and-tell', 'The Spotlight chooses something they enjoy and shares it with the household.', 'conversation', 'spotlight', 2, 99, 20, 'indoor', 'either', 'low', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-build-together', NULL, 'Build something simple', 'Use materials already at home to make something together.', 'creative', 'skill_sharing', 2, 99, 45, 'indoor', 'off_screen', 'medium', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-proud-of', NULL, 'Talk about something you are proud of', 'Each person can share one small win, with no pressure to speak.', 'conversation', 'conversation', 2, 99, 15, 'indoor', 'off_screen', 'low', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-family-baking', NULL, 'Bake a family favourite', 'Make a favourite bake together and share the jobs safely.', 'food', 'whole_family', 2, 99, 60, 'indoor', 'off_screen', 'medium', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-sports-watch', NULL, 'Watch a match together', 'Choose a match or shared sports event and keep phones away for the best moments.', 'sports', 'whole_family', 2, 99, 120, 'indoor', 'screen_shared', 'medium', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-family-karaoke', NULL, 'Have a family music session', 'Choose songs, sing along or make up a gentle dance together.', 'music', 'whole_family', 2, 99, 45, 'indoor', 'screen_shared', 'high', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-dessert-choice', NULL, 'Choose dessert together', 'Pick or make a simple dessert and enjoy it around the table.', 'food', 'whole_family', 2, 99, 20, 'indoor', 'off_screen', 'low', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-story-time', NULL, 'Read or share a story', 'Take turns reading, telling or listening to a story together.', 'learning', 'whole_family', 2, 99, 20, 'indoor', 'off_screen', 'low', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-garden-together', NULL, 'Do a little garden care', 'Spend a short, safe time looking after plants or an outdoor space.', 'outdoors', 'active', 2, 99, 30, 'outdoor', 'off_screen', 'medium', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-family-campout', NULL, 'Make a living-room campout', 'Build a cosy indoor campout and spend time together without rushing.', 'games', 'whole_family', 2, 99, 90, 'indoor', 'off_screen', 'low', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-family-pictures', NULL, 'Take family photographs', 'Make a few playful family photographs and choose one to keep.', 'creative', 'whole_family', 2, 99, 30, 'either', 'screen_shared', 'medium', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('system-dream-holiday', NULL, 'Imagine a dream holiday', 'Take turns choosing a place, food or activity for an imaginary family trip.', 'conversation', 'whole_family', 2, 99, 20, 'indoor', 'off_screen', 'low', 'system', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
