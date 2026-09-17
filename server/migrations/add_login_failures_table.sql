-- Account-level failed-login counter — closes the gap a pure IP-based rate
-- limiter (middlewares/rateLimiter.middleware.js) can't cover: an attacker
-- spreading login attempts across many IPs never trips any single IP's
-- counter, but every attempt still targets the same email. Keyed by
-- normalized email, not IP. One row per email; cleared on a successful
-- login (see modules/auth/login-failure.repository.js).

CREATE TABLE IF NOT EXISTS login_failures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  failed_count INT NOT NULL DEFAULT 0,
  first_failed_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_login_failures_email (email)
);
