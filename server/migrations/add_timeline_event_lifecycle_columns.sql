-- Application Journey Pipeline (Phase 1) — additive, backward-compatible
-- columns on the EXISTING timeline_events table. No new events table.
--
-- email_received_at: the Gmail internalDate of the source email, kept
--   separate from event_date (which may be a date resolved/extracted FROM
--   the email body, e.g. "your interview is on the 24th" parsed relative to
--   when the email arrived). Existing rows/readers that only look at
--   event_date are unaffected.
-- confidence: extraction confidence for this specific event (0-100),
--   independent of match_confidence (which scores the application match).
-- metadata: JSON bag for event-specific detail — round number, interview
--   mode, source ('ai' | 'deterministic_parser' | 'manual'), etc. — without
--   forcing a schema change every time a new lifecycle event needs one more
--   field.
-- is_dismissed / dismissed_at: soft-hide for the "Dismiss Event" UI control
--   (Phase 8), following the same soft-delete convention as
--   applications.deleted_at — never a physical DELETE.
ALTER TABLE timeline_events
  ADD COLUMN email_received_at DATETIME NULL AFTER event_date,
  ADD COLUMN confidence DECIMAL(5,2) NULL AFTER match_confidence,
  ADD COLUMN metadata JSON NULL AFTER confidence,
  ADD COLUMN is_dismissed TINYINT(1) NOT NULL DEFAULT 0 AFTER metadata,
  ADD COLUMN dismissed_at DATETIME NULL AFTER is_dismissed;

-- Dedupe support (Phase 3 of the spec / idempotency rule): the same Gmail
-- message reprocessed (re-sync, retry, incremental-sync overlap) must never
-- create a second event, but legitimate repeats (e.g. an interview
-- rescheduled — same event_type, different event_date, different email)
-- must still be allowed. Keying on (email_msg_id, event_type, event_date)
-- rather than event_type alone satisfies both. NULL email_msg_id (manual
-- milestones) never collides via this index since MySQL treats NULLs as
-- distinct in a unique index.
ALTER TABLE timeline_events
  ADD UNIQUE KEY uq_email_event_dedupe (email_msg_id, event_type, event_date);
