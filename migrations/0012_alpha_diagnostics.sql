CREATE TABLE IF NOT EXISTS alpha_diagnostic_events (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  event_name TEXT NOT NULL CHECK (length(trim(event_name)) BETWEEN 1 AND 80),
  screen TEXT,
  action TEXT,
  status_code INTEGER,
  error_code TEXT,
  request_id TEXT,
  duration_ms INTEGER,
  device_class TEXT,
  runtime_id TEXT,
  app_version TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_alpha_diagnostic_events_household_created
  ON alpha_diagnostic_events(household_id, created_at DESC);

CREATE TABLE IF NOT EXISTS alpha_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  household_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('confusion', 'bug', 'idea', 'delight', 'other')),
  screen TEXT,
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  message TEXT CHECK (message IS NULL OR length(trim(message)) BETWEEN 1 AND 2000),
  app_version TEXT,
  runtime_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_alpha_feedback_household_created
  ON alpha_feedback(household_id, created_at DESC);
