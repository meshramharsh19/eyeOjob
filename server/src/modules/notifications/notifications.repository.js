const db = require('../../config/database');

// INSERT IGNORE relies on the uq_user_email_event unique key (migrations/
// add_notifications_table.sql) to make duplicate inserts a no-op at the DB
// level — the same Gmail message can be reprocessed via re-sync/retry/
// incremental-sync overlap, and this must never create a second row for it.
const insert = async ({ userId, applicationId, emailMsgId, eventType, severity, title, body }) => {
  const [result] = await db.query(
    `INSERT IGNORE INTO notifications
     (user_id, application_id, email_msg_id, event_type, severity, title, body)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, applicationId || null, emailMsgId || null, eventType, severity, title, body || null]
  );
  return result.insertId || null;
};

const clampLimit = (limit) => Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
const clampOffset = (offset) => Math.max(parseInt(offset, 10) || 0, 0);

const findByUser = async (userId, { limit, offset } = {}) => {
  const [rows] = await db.query(
    `SELECT id, application_id, email_msg_id, event_type, severity, title, body,
            is_read, read_at, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY is_read ASC, created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, clampLimit(limit), clampOffset(offset)]
  );
  return rows;
};

const getUnreadCount = async (userId) => {
  const [rows] = await db.query(
    'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return rows[0]?.count || 0;
};

// Scoped by user_id in the WHERE clause (not just id) so a user can never
// mark — or even affect the row count of — another user's notification.
const markRead = async (id, userId) => {
  const [result] = await db.query(
    'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return result.affectedRows > 0;
};

const markAllRead = async (userId) => {
  await db.query(
    'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
    [userId]
  );
};

module.exports = { insert, findByUser, getUnreadCount, markRead, markAllRead };
