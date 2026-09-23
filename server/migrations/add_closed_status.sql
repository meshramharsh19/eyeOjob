-- applications.status is a MySQL ENUM (not tracked by an earlier migration
-- file — it predates this migrations/ folder). Adding 'Closed' as an
-- allowed application status (see applications.service.js ALLOWED_STATUSES)
-- requires widening this enum too — application-layer validation alone
-- doesn't change what the column itself accepts. Without this, inserting
-- 'Closed' silently truncates to '' under non-strict SQL mode instead of
-- erroring, which is what actually happened before this migration existed.
ALTER TABLE applications
  MODIFY COLUMN status ENUM(
    'Applied', 'OA', 'Interview', 'HR Round', 'Final Round',
    'Offer', 'Rejected', 'Withdrawn', 'Ghosted', 'Closed'
  ) DEFAULT 'Applied';

-- Repair rows corrupted by the bug this migration fixes: every other status
-- string already existed in the old enum, so status = '' can only mean a
-- pre-migration attempt to save 'Closed' got silently truncated.
UPDATE applications SET status = 'Closed' WHERE status = '';
