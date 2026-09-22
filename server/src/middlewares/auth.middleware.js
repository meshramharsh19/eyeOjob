const jwt = require('jsonwebtoken');
const env = require('../config/env');
const db = require('../config/database');
const { UnauthorizedError } = require('../errors');

// Verifies the bearer JWT and attaches the decoded payload as req.user.
// Consolidated from the three copies previously duplicated in
// routes/auth.js, routes/gmail.js and routes/jobs.js.
//
// Also checks is_active on every request (not just at login) — a JWT is
// stateless and stays valid for its full 7-day life otherwise, so a user who
// deactivates mid-session would keep working with an old token until it
// expired. This costs one indexed lookup per authenticated request.
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next(new UnauthorizedError('No token'));
  let payload;
  try {
    payload = jwt.verify(token, env.jwt.secret);
  } catch {
    return next(new UnauthorizedError('Invalid token'));
  }

  try {
    const [rows] = await db.query('SELECT is_active FROM users WHERE id = ?', [payload.id]);
    if (!rows[0] || !rows[0].is_active) {
      return next(new UnauthorizedError('Account deactivated'));
    }
  } catch (err) {
    return next(err);
  }

  req.user = payload;
  next();
};

module.exports = authMiddleware;
