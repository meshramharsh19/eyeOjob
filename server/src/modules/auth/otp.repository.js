const db = require('../../config/database');

// Persistent replacement for the old in-memory `otpStore`/`resetOtpStore`
// Maps — see migrations/add_otp_tables.sql. One row per email per table;
// upsert overwrites the previous OTP for that email, same as Map.set() did.

// ── Signup OTPs ─────────────────────────────────
// Carries the pending registration payload (name + already-hashed password)
// until the OTP is verified and the real `users` row gets created.
const upsertSignupOtp = async ({ email, otp, name, password, expiresAt }) => {
  await db.query(
    `INSERT INTO signup_otps (email, otp, name, password, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE otp = VALUES(otp), name = VALUES(name),
       password = VALUES(password), expires_at = VALUES(expires_at)`,
    [email, otp, name, password, expiresAt]
  );
};

const findSignupOtp = async (email) => {
  const [rows] = await db.query('SELECT * FROM signup_otps WHERE email = ?', [email]);
  return rows[0] || null;
};

const deleteSignupOtp = async (email) => {
  await db.query('DELETE FROM signup_otps WHERE email = ?', [email]);
};

// ── Password-reset OTPs ─────────────────────────
// Also tracks `verified`, flipped once verifyResetOtp passes, which gates
// the later resetPassword call.
const upsertResetOtp = async ({ email, otp, userId, name, verified = false, expiresAt }) => {
  await db.query(
    `INSERT INTO password_reset_otps (email, otp, user_id, name, verified, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE otp = VALUES(otp), user_id = VALUES(user_id),
       name = VALUES(name), verified = VALUES(verified), expires_at = VALUES(expires_at)`,
    [email, otp, userId, name, verified, expiresAt]
  );
};

const findResetOtp = async (email) => {
  const [rows] = await db.query('SELECT * FROM password_reset_otps WHERE email = ?', [email]);
  return rows[0] || null;
};

const deleteResetOtp = async (email) => {
  await db.query('DELETE FROM password_reset_otps WHERE email = ?', [email]);
};

module.exports = {
  upsertSignupOtp,
  findSignupOtp,
  deleteSignupOtp,
  upsertResetOtp,
  findResetOtp,
  deleteResetOtp,
};
