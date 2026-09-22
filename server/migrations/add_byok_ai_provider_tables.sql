-- BYOK hybrid AI provider architecture — see Project DOCs/BYOK.md for the
-- full design. Adds: per-user connected AI provider keys (personal fallback
-- chain), per-call usage telemetry, monthly free-tier quota tracking, and a
-- subscriptions seam table for a future paid tier. Also adds 'needs_quota'
-- to processed_emails.classification and 'needs_upgrade_or_key' to
-- sync_status.status.

CREATE TABLE IF NOT EXISTS user_ai_providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(50) NOT NULL COMMENT 'groq, gemini, xai, openrouter, mistral, ...',
  encrypted_credential TEXT NOT NULL COMMENT 'AES-256-GCM: hex(iv):hex(ciphertext):hex(tag)',
  credential_type ENUM('api_key', 'oauth_token') NOT NULL DEFAULT 'api_key',
  model VARCHAR(100) NOT NULL,
  priority INT NOT NULL DEFAULT 0 COMMENT 'Lower = tried first in this user''s fallback chain',
  status ENUM(
    'CONNECTED','INVALID','EXPIRED','REVOKED',
    'QUOTA_EXCEEDED','RATE_LIMITED','ERROR','DISCONNECTED'
  ) NOT NULL DEFAULT 'CONNECTED',
  last_validated_at DATETIME NULL,
  last_used_at DATETIME NULL,
  last_error_code VARCHAR(50) NULL,
  last_error_message VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_provider (user_id, provider),
  KEY idx_user_priority (user_id, priority),
  CONSTRAINT fk_user_ai_providers_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  source ENUM('BYOK','MANAGED_FREE','MANAGED_UNLIMITED') NOT NULL,
  operation VARCHAR(50) NOT NULL DEFAULT 'email_extraction',
  latency_ms INT NOT NULL,
  success TINYINT(1) NOT NULL,
  error_category VARCHAR(50) NULL,
  prompt_tokens INT NULL,
  completion_tokens INT NULL,
  total_tokens INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_user_created (user_id, created_at),
  CONSTRAINT fk_ai_usage_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_ai_monthly_usage (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  period_month CHAR(7) NOT NULL COMMENT 'UTC, e.g. 2026-09',
  calls_used INT NOT NULL DEFAULT 0,
  quota_notified TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Debounce flag: notifyQuotaExceeded fired once per month per user',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_month (user_id, period_month),
  CONSTRAINT fk_user_ai_monthly_usage_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id INT PRIMARY KEY,
  plan ENUM('free', 'pro') NOT NULL DEFAULT 'free',
  has_managed_ai TINYINT(1) NOT NULL DEFAULT 0,
  monthly_call_cap INT NULL COMMENT 'NULL = use global FREE_MONTHLY_CAP; set to override per-user',
  renews_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill every existing user onto the free plan so resolveChain() always
-- has a row to read — nobody should be retroactively treated as unlimited
-- or as already-exhausted just because the migration ran.
INSERT IGNORE INTO subscriptions (user_id, plan, has_managed_ai)
SELECT id, 'free', 0 FROM users;

-- processed_emails.classification is already a freeform VARCHAR(50), so the
-- new 'needs_quota' value (distinct from 'extraction_failed' — only retried
-- after the monthly quota resets or a BYOK key is connected, never retried
-- pointlessly on every subsequent sync) needs no schema change, just a new
-- string value written by application code.

-- sync_status: distinct from 'needs_reconnect' — fires when a user has no
-- BYOK key connected and has exhausted their monthly free-tier quota. The
-- scheduler excludes it the same way it excludes 'needs_reconnect'.
ALTER TABLE sync_status
  MODIFY COLUMN status ENUM('idle', 'syncing', 'success', 'failed', 'stopped', 'needs_reconnect', 'needs_upgrade_or_key') NOT NULL DEFAULT 'idle';
