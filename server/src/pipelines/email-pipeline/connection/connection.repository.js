const db = require('../../../config/database');

const saveGmailTokens = async (userId, { accessToken, refreshToken }) => {
  await db.query(
    `UPDATE users
     SET gmail_token = ?, refresh_token = ?, gmail_connected = 1
     WHERE id = ?`,
    [accessToken, refreshToken, userId]
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
