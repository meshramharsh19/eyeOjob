const db = require('../../config/database');

const findByEmail = async (email) => {
  const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
  return rows[0] || null;
};

const findPublicById = async (id) => {
  const [rows] = await db.query('SELECT id, name, email, avatar FROM users WHERE id = ?', [id]);
  return rows[0] || null;
};

const createUser = async ({ name, email, hashedPassword }) => {
  await db.query(
    'INSERT INTO users (name, email, password, is_verified) VALUES (?, ?, ?, ?)',
    [name, email, hashedPassword, 1]
  );
};

const updatePassword = async (userId, hashedPassword) => {
  await db.query('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, userId]);
};

const deactivateUser = async (userId) => {
  await db.query('UPDATE users SET is_active = 0, deactivated_at = NOW() WHERE id = ?', [userId]);
};

const reactivateUser = async (userId) => {
  await db.query('UPDATE users SET is_active = 1, deactivated_at = NULL WHERE id = ?', [userId]);
};

module.exports = {
  findByEmail, findPublicById, createUser, updatePassword, deactivateUser, reactivateUser,
};
