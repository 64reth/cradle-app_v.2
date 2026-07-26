PRAGMA foreign_keys = ON;

-- `companions` contains the retired synthetic household guide, never a real
-- family member. Preserve historical rows while preventing them from being
-- recreated or shown.
UPDATE companions
SET is_active = 0,
    updated_at = datetime('now')
WHERE is_active = 1;

-- The historical `companion` setup value is retained as the internal state
-- for the real Owner's member-avatar step. It no longer refers to a guide.

-- The retired synthetic table remains for immutable migration history only.
-- Prevent application or seed code from recreating active rows.
CREATE TRIGGER companions_prevent_active_insert
BEFORE INSERT ON companions
WHEN NEW.is_active = 1
BEGIN
  SELECT RAISE(ABORT, 'retired synthetic companion records cannot be activated');
END;

CREATE TRIGGER companions_prevent_reactivation
BEFORE UPDATE OF is_active ON companions
WHEN NEW.is_active = 1
BEGIN
  SELECT RAISE(ABORT, 'retired synthetic companion records cannot be activated');
END;
