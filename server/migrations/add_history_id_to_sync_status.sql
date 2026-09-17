ALTER TABLE sync_status
  ADD COLUMN last_history_id VARCHAR(50) NULL AFTER last_sync_at;
