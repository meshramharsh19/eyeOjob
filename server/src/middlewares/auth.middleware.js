const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { UnauthorizedError } = require('../errors');

// Verifies the bearer JWT and attaches the decoded payload as req.user.
// Consolidated from the three copies previously duplicated in
// routes/auth.js, routes/gmail.js and routes/jobs.js.
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next(new UnauthorizedError('No token'));
  try {
    req.user = jwt.verify(token, env.jwt.secret);
    next();
  } catch {
    next(new UnauthorizedError('Invalid token'));
  }
};

module.exports = authMiddleware;
