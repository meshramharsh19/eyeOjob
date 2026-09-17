-- Adds a dedicated timestamp for when an application's status last changed.
-- updated_at bumps on ANY field edit, so it can't be used to compute
-- "days stuck in current status" — this column tracks status transitions only.
ALTER TABLE applications
  ADD COLUMN status_changed_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill: best-available approximation for existing rows.
UPDATE applications
SET status_changed_at = COALESCE(applied_date, created_at, NOW())
WHERE status_changed_at IS NULL;
