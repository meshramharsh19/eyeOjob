const logger = require('../config/logger');
const AppError = require('../errors/AppError');

// Must be registered last, after all routes.
const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  if (statusCode >= 500) logger.error(err.stack || err.message);
  res.status(statusCode).json({ error: err.message || 'Internal server error' });
};

module.exports = errorHandler;
