-- AI Correction Feedback Loop (Project DOCs/ai-feedback-loop.md), §3.3.
--
-- Structured record of every genuine "AI was wrong, here's what's actually
-- true" signal — a user correcting an AI-derived status/company/role on an
-- application it created, or deleting one because it was never a real job
-- application (reason = 'not_a_job'). Trigger/attribution rules: §4 of the
-- same doc. Feeds three consumers (§5): personal alias auto-write, bounded
-- few-shot prompt injection, and offline deterministic-parser mining.
CREATE TABLE IF NOT EXISTS ai_correction_feedback (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  application_id INT NOT NULL,
  processed_email_id INT NULL,

  field_corrected ENUM('status', 'company', 'role', 'false_positive') NOT NULL,
  ai_predicted_value VARCHAR(255) NULL,
  user_corrected_value VARCHAR(255) NULL,

  -- Denormalized snapshot — deliberate, not an oversight: survives
  -- processed_email_id being nulled out if the source email row is later
  -- deleted/rotated, and lets admin/export queries (§5.3) run without a
  -- join on the heavier processed_emails table.
  sender_domain VARCHAR(255) NULL,
  email_subject VARCHAR(500) NULL,
  ai_classification VARCHAR(100) NULL,
  ai_confidence DECIMAL(5,2) NULL,

  is_reviewed TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_user_field (user_id, field_corrected),
  INDEX idx_domain_field (sender_domain, field_corrected),
  INDEX idx_created (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  FOREIGN KEY (processed_email_id) REFERENCES processed_emails(id) ON DELETE SET NULL
);
