const rateLimit = require('express-rate-limit');
const rateLimitConfig = require('../config/rateLimit');

// One named limiter per sensitive auth endpoint (see routes/auth.routes.js),
// each with its own counter/window, so a user retrying /login doesn't burn
// their /resend-otp quota. In-memory store — correct for the current
// single-instance deployment. If this ever runs as more than one instance,
// swap the (implicit) MemoryStore for a shared one (e.g. Redis) here — every
// call site stays the same since they only import the built limiters below.
const rateLimitHandler = (req, res) => {
  // Matches the app's { error: message } convention (see
  // errorHandler.middleware.js) so the client's existing
  // err.response.data.error handling picks this up with no special-casing.
  res.status(429).json({ error: 'Too many requests. Please try again later.' });
};

const buildLimiter = ({ windowMs, max }) => rateLimit({
  windowMs,
  max,
  standardHeaders: true, // adds RateLimit-Limit / -Remaining / -Reset headers
  legacyHeaders: false,
  handler: rateLimitHandler,
});

module.exports = {
  loginLimiter: buildLimiter(rateLimitConfig.login),
  registerLimiter: buildLimiter(rateLimitConfig.register),
  verifyOtpLimiter: buildLimiter(rateLimitConfig.verifyOtp),
  resendOtpLimiter: buildLimiter(rateLimitConfig.resendOtp),
  forgotPasswordLimiter: buildLimiter(rateLimitConfig.forgotPassword),
  resendResetOtpLimiter: buildLimiter(rateLimitConfig.resendResetOtp),
  verifyResetOtpLimiter: buildLimiter(rateLimitConfig.verifyResetOtp),
  resetPasswordLimiter: buildLimiter(rateLimitConfig.resetPassword),
  // Exposed for tests (see test/rateLimiter.test.js) so limiter behavior can
  // be verified with small/fast windows without waiting out real config values.
  buildLimiter,
};
