-- last_sync_at was originally defined as
--   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
-- which silently violates the core sync-status requirement that a FAILED
-- sync must never touch last_sync_at — it must only reflect the last time a
-- sync actually SUCCEEDED. Any UPDATE to the row auto-refreshes a column with
-- this definition, even one that never mentions it — so
-- pipeline.repository.js completeSyncFailure() (which deliberately omits
-- last_sync_at from its SET list) was silently advancing it anyway.
--
-- Confirmed live: a corrupted-token failure test moved last_sync_at forward
-- by 30s purely from the UPDATE's side effect, with the column's own
-- semantics doing that, not the application code.
--
-- Also drops the DEFAULT CURRENT_TIMESTAMP: a brand-new user's first-ever
-- sync_status row (inserted by startSync() with status='syncing', no
-- last_sync_at) should show no successful sync yet, not a fabricated "just
-- now" timestamp from row-creation time.
ALTER TABLE sync_status
  MODIFY COLUMN last_sync_at TIMESTAMP NULL DEFAULT NULL;
