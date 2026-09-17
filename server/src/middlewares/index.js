const authMiddleware = require('./auth.middleware');
const errorHandler = require('./errorHandler.middleware');
const notFound = require('./notFound.middleware');
const requestLogger = require('./requestLogger.middleware');

module.exports = { authMiddleware, errorHandler, notFound, requestLogger };
