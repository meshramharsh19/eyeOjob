-- Adds 'needs_reconnect' as a valid sync_status.status value, distinct from
-- 'failed'. Reserved for genuine Gmail auth/authorization failures (revoked
-- or expired refresh token — sync-error.mapper.js GMAIL_AUTH_EXPIRED) where
-- retrying the sync as-is can never succeed until the user reconnects Gmail.
-- Transient failures (network blips, rate limits, provider errors, AI
-- extraction issues) stay 'failed' and remain eligible for the next
-- scheduled retry — see scheduler.js eligibility query.

ALTER TABLE sync_status
  MODIFY COLUMN status ENUM('idle', 'syncing', 'success', 'failed', 'stopped', 'needs_reconnect') NOT NULL DEFAULT 'idle';
