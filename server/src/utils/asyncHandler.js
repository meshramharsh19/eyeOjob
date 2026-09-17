// Wraps an async route handler so a rejected promise reaches errorHandler.middleware.js
// instead of crashing the process (Express 5 does forward async rejections automatically,
// but this keeps handlers consistent and explicit).
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
