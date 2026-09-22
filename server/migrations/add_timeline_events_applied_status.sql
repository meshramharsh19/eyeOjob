-- AI Correction Feedback Loop (Project DOCs/ai-feedback-loop.md), §3.1.
--
-- Structured signal for "did this specific timeline_events row actually set
-- applications.status" — distinct from event_date/received_at ordering,
-- which cannot safely answer that question. A correspondence-only email
-- (survey, follow-up) can arrive AFTER the real status-setting email but
-- never change applications.status (locked application, or blocked by the
-- terminal/regression guard in pipeline.orchestrator.js's shouldApplyStatus).
-- Picking "most recent timeline_events row" as the culprit for a user's
-- later correction would silently pair the correction with the wrong
-- email's text. applied_status makes that lookup exact instead of guessed:
--   - NULL            → this row never changed applications.status
--   - '<StatusValue>' → this row is the one that set applications.status
--                        to exactly that value
--
-- Not folded into the existing metadata JSON column on this same table
-- (see add_timeline_event_lifecycle_columns.sql) — the culprit-resolution
-- query needs an exact-match, indexable WHERE applied_status = ?, which
-- MySQL can't do on a JSON column without a generated/virtual column (same
-- migration cost as just adding a real one).
ALTER TABLE timeline_events
  ADD COLUMN applied_status VARCHAR(50) NULL DEFAULT NULL AFTER event_type,
  ADD INDEX idx_timeline_app_status (application_id, applied_status);
