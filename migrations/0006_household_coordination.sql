PRAGMA foreign_keys = ON;

CREATE TABLE household_events (
  id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  created_by_member_id TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  event_type TEXT NOT NULL CHECK(event_type IN (
    'family_meeting','leadership_meeting','child_meeting','appointment','school_event',
    'trip','birthday','household_reminder','event','weekly_review'
  )),
  description TEXT CHECK(description IS NULL OR length(description) <= 1000),
  location TEXT CHECK(location IS NULL OR length(trim(location)) BETWEEN 1 AND 200),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  timezone TEXT NOT NULL CHECK(length(trim(timezone)) BETWEEN 1 AND 100),
  recurrence_key TEXT NOT NULL DEFAULT 'one_off' CHECK(recurrence_key IN (
    'one_off','daily','weekly','fortnightly','monthly','yearly','custom'
  )),
  custom_recurrence TEXT CHECK(custom_recurrence IS NULL OR length(trim(custom_recurrence)) BETWEEN 1 AND 300),
  reminder_minutes INTEGER CHECK(reminder_minutes IS NULL OR reminder_minutes BETWEEN 0 AND 10080),
  visibility TEXT NOT NULL DEFAULT 'household' CHECK(visibility IN ('household','leadership')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
  client_key TEXT NOT NULL CHECK(length(trim(client_key)) BETWEEN 8 AND 100),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  cancelled_at TEXT,
  PRIMARY KEY (household_id, id),
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, created_by_member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT,
  CHECK(ends_at IS NULL OR ends_at > starts_at),
  CHECK((recurrence_key = 'custom' AND custom_recurrence IS NOT NULL)
    OR (recurrence_key != 'custom' AND custom_recurrence IS NULL)),
  CHECK((event_type = 'leadership_meeting' AND visibility = 'leadership')
    OR event_type != 'leadership_meeting')
);

CREATE UNIQUE INDEX household_events_creator_client_idx
  ON household_events(household_id, created_by_member_id, client_key);
CREATE INDEX household_events_household_schedule_idx
  ON household_events(household_id, status, starts_at, event_type);

CREATE TABLE household_event_members (
  household_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  participation_role TEXT NOT NULL DEFAULT 'attendee'
    CHECK(participation_role IN ('attendee','subject')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (household_id, event_id, member_id),
  FOREIGN KEY (household_id, event_id) REFERENCES household_events(household_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (household_id, member_id) REFERENCES members(household_id, id) ON DELETE RESTRICT
);

CREATE INDEX household_event_members_member_idx
  ON household_event_members(household_id, member_id, event_id);
