const db = require('../../../config/database');
const { encrypt } = require('../../../utils/crypto.util');

const saveGmailTokens = async (userId, { accessToken, refreshToken }) => {
  // Google only returns a refresh_token on first consent — COALESCE keeps
  // the existing one on later reconnects instead of wiping it with NULL.
  await db.query(
    `UPDATE users
     SET gmail_token = ?, refresh_token = COALESCE(?, refresh_token), gmail_connected = 1
     WHERE id = ?`,
    [encrypt(accessToken), refreshToken ? encrypt(refreshToken) : null, userId]
  );
};

const ensureSyncStatusRow = async (userId) => {
  await db.query(
    `INSERT INTO sync_status (user_id) VALUES (?)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [userId]
  );
};

const getConnectionStatus = async (userId) => {
  const [users] = await db.query(
    'SELECT gmail_connected FROM users WHERE id = ?',
    [userId]
  );
  return !!users[0]?.gmail_connected;
};

module.exports = { saveGmailTokens, ensureSyncStatusRow, getConnectionStatus };
