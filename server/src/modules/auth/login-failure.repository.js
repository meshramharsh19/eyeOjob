const db = require('../../config/database');

// Account-level failed-login counter — see migrations/add_login_failures_table.sql
// for why this exists alongside the IP-based rate limiter.

const normalizeEmail = (email) => email.trim().toLowerCase();

const find = async (email) => {
  const [rows] = await db.query('SELECT * FROM login_failures WHERE email = ?', [normalizeEmail(email)]);
  return rows[0] || null;
};

// Records one failed attempt and returns the new count. If the previous
// window has already expired, the counter restarts at 1 instead of
// accumulating forever across unrelated attack windows.
const recordFailure = async (email, windowMs) => {
  const normalized = normalizeEmail(email);
  const existing = await find(normalized);
  const now = new Date();
  const windowExpired = existing && (now.getTime() - new Date(existing.first_failed_at).getTime() > windowMs);

  if (!existing || windowExpired) {
    await db.query(
      `INSERT INTO login_failures (email, failed_count, first_failed_at)
       VALUES (?, 1, ?)
       ON DUPLICATE KEY UPDATE failed_count = 1, first_failed_at = VALUES(first_failed_at)`,
      [normalized, now]
    );
    return 1;
  }

  await db.query('UPDATE login_failures SET failed_count = failed_count + 1 WHERE email = ?', [normalized]);
  return existing.failed_count + 1;
};

// Called on a successful login so a legitimate user who mistyped their
// password a few times isn't left sitting near the threshold.
const reset = async (email) => {
  await db.query('DELETE FROM login_failures WHERE email = ?', [normalizeEmail(email)]);
};

module.exports = { find, recordFailure, reset };
