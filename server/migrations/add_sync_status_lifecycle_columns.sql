-- Extends the existing sync_status table with a lifecycle/error-visibility
-- layer (see pipeline.orchestrator.js syncUserEmails, records.repository.js
-- findSyncStatus) — reuses this table rather than introducing a parallel one.
--
-- last_synced_at already existed as last_sync_at and keeps meaning "the last
-- SUCCESSFUL sync" — a failed sync must never touch it, only status/
-- last_error_*/last_sync_finished_at (see pipeline.repository.js
-- completeSyncFailure).

ALTER TABLE sync_status
  ADD COLUMN status ENUM('idle', 'syncing', 'success', 'failed') NOT NULL DEFAULT 'idle' AFTER user_id,
  ADD COLUMN last_error_code VARCHAR(50) NULL,
  ADD COLUMN last_error_message VARCHAR(500) NULL,
  ADD COLUMN last_sync_started_at TIMESTAMP NULL,
  ADD COLUMN last_sync_finished_at TIMESTAMP NULL,
  ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
