-- Moves signup/password-reset OTPs out of in-memory Maps (auth.service.js)
-- into MySQL, so they survive a server restart and work across multiple
-- instances. One row per email per table — a new OTP for the same email
-- overwrites the previous one (see otp.repository.js upsert via
-- ON DUPLICATE KEY UPDATE), matching the old Map.set() replace-in-place
-- behaviour.

CREATE TABLE IF NOT EXISTS signup_otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp VARCHAR(10) NOT NULL,
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255) NOT NULL, -- already-hashed password, held until OTP verification creates the user row
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_signup_otp_email (email)
);

CREATE TABLE IF NOT EXISTS password_reset_otps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp VARCHAR(10) NOT NULL,
  user_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  verified TINYINT(1) NOT NULL DEFAULT 0, -- flipped once verifyResetOtp passes, gates resetPassword
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_reset_otp_email (email)
);
