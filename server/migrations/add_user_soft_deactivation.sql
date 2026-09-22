-- Soft account deactivation — a user is never hard-deleted through the normal
-- deactivate flow. is_active flips to 0 and deactivated_at is stamped; all
-- existing rows (applications, processed_emails, timeline_events, gmail
-- tokens) stay attached to the same user_id and become visible again the
-- moment the account is reactivated (same identity match, no new user row).

ALTER TABLE users
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER gmail_connected,
  ADD COLUMN deactivated_at DATETIME NULL AFTER is_active;
