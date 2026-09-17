const AppError = require('./AppError');

class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(message, 400);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found') {
    super(message, 404);
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 429);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

module.exports = { BadRequestError, UnauthorizedError, NotFoundError, TooManyRequestsError, ConflictError };
