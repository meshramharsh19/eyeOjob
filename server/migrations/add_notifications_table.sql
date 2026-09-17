-- Migration: In-app notifications for pipeline-detected important job events
-- (interview/assessment/offer/rejection/etc). No email delivery fields here —
-- this is a database record the frontend reads, not an outbox. See
-- notifications.service.js for the event_type -> title/severity mapping.

CREATE TABLE IF NOT EXISTS notifications (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  application_id INT NULL,
  email_msg_id VARCHAR(255) NULL,
  event_type VARCHAR(50) NOT NULL,
  severity ENUM('info', 'success', 'warning', 'critical') NOT NULL DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  body VARCHAR(500) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,

  -- Same email classified into the same event more than once (re-sync, retry,
  -- incremental-sync overlap) must not create a second notification row.
  UNIQUE KEY uq_user_email_event (user_id, email_msg_id, event_type),

  INDEX idx_user_unread_created (user_id, is_read, created_at DESC)
);
