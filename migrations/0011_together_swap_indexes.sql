-- A swapped Moment remains in the daily history, but no longer occupies the
-- active primary/secondary slot. This lets a weekend primary be replaced
-- while preserving the optional secondary Moment and the original record.
DROP INDEX IF EXISTS together_primary_day_idx;
DROP INDEX IF EXISTS together_secondary_day_idx;

CREATE UNIQUE INDEX together_primary_day_idx
  ON together_daily_moments(household_id, local_date)
  WHERE is_primary = 1 AND status NOT IN ('swapped', 'cancelled');

CREATE UNIQUE INDEX together_secondary_day_idx
  ON together_daily_moments(household_id, local_date)
  WHERE is_primary = 0 AND status NOT IN ('swapped', 'cancelled');
