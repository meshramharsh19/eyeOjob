// Centralized, env-configurable rate-limit policy for the auth endpoints —
// see middlewares/rateLimiter.middleware.js (IP-level, express-rate-limit)
// and modules/auth/login-failure.repository.js (account-level, MySQL-backed).
//
// Each entry is deliberately its own counter/window so hitting one endpoint's
// limit never eats into another's — e.g. retrying /login shouldn't burn your
// /resend-otp quota.

const minutes = (n) => n * 60 * 1000;

const parseIntEnv = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

module.exports = {
  // IP-level request caps (layer 1 — protects the endpoint itself).
  login: {
    windowMs: minutes(parseIntEnv(process.env.AUTH_LOGIN_RATE_WINDOW_MINUTES, 15)),
    max: parseIntEnv(process.env.AUTH_LOGIN_RATE_LIMIT, 20),
  },
  register: {
    windowMs: minutes(parseIntEnv(process.env.AUTH_REGISTER_RATE_WINDOW_MINUTES, 60)),
    max: parseIntEnv(process.env.AUTH_REGISTER_RATE_LIMIT, 10),
  },
  verifyOtp: {
    windowMs: minutes(parseIntEnv(process.env.AUTH_OTP_VERIFY_RATE_WINDOW_MINUTES, 10)),
    max: parseIntEnv(process.env.AUTH_OTP_VERIFY_RATE_LIMIT, 5),
  },
  resendOtp: {
    windowMs: minutes(parseIntEnv(process.env.AUTH_OTP_SEND_RATE_WINDOW_MINUTES, 10)),
    max: parseIntEnv(process.env.AUTH_OTP_SEND_RATE_LIMIT, 3),
  },
  forgotPassword: {
    windowMs: minutes(parseIntEnv(process.env.AUTH_FORGOT_PASSWORD_RATE_WINDOW_MINUTES, 15)),
    max: parseIntEnv(process.env.AUTH_FORGOT_PASSWORD_RATE_LIMIT, 3),
  },
  resendResetOtp: {
    windowMs: minutes(parseIntEnv(process.env.AUTH_RESET_OTP_SEND_RATE_WINDOW_MINUTES, 10)),
    max: parseIntEnv(process.env.AUTH_RESET_OTP_SEND_RATE_LIMIT, 3),
  },
  verifyResetOtp: {
    windowMs: minutes(parseIntEnv(process.env.AUTH_RESET_OTP_VERIFY_RATE_WINDOW_MINUTES, 10)),
    max: parseIntEnv(process.env.AUTH_RESET_OTP_VERIFY_RATE_LIMIT, 5),
  },
  resetPassword: {
    windowMs: minutes(parseIntEnv(process.env.AUTH_RESET_PASSWORD_RATE_WINDOW_MINUTES, 15)),
    max: parseIntEnv(process.env.AUTH_RESET_PASSWORD_RATE_LIMIT, 5),
  },

  // Account-level failed-login counter (layer 2 — closes the IP-rotation gap;
  // see modules/auth/login-failure.repository.js). Keyed by normalized email,
  // not IP, so an attacker spreading attempts across many IPs still trips it.
  loginFailure: {
    windowMs: minutes(parseIntEnv(process.env.AUTH_LOGIN_FAILURE_WINDOW_MINUTES, 15)),
    max: parseIntEnv(process.env.AUTH_LOGIN_FAILURE_LIMIT, 5),
  },
};
