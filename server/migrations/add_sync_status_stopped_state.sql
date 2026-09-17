-- Adds 'stopped' as a valid sync_status.status value so a user-initiated
-- cancellation (POST /jobs/sync/stop) can be recorded distinctly from a
-- genuine failure — see pipeline.orchestrator.js requestStop()/syncUserEmails()
-- and pipeline.repository.js completeSyncStopped().

ALTER TABLE sync_status
  MODIFY COLUMN status ENUM('idle', 'syncing', 'success', 'failed', 'stopped') NOT NULL DEFAULT 'idle';
