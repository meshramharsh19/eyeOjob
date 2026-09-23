const crypto = require('crypto');
const express = require('express');
const passport = require('passport');
const env = require('../../config/env');
const authMiddleware = require('../../middlewares/auth.middleware');
const {
  loginLimiter,
  registerLimiter,
  verifyOtpLimiter,
  resendOtpLimiter,
  forgotPasswordLimiter,
  resendResetOtpLimiter,
  verifyResetOtpLimiter,
  resetPasswordLimiter,
  oauthExchangeLimiter,
} = require('../../middlewares/rateLimiter.middleware');
const { asyncHandler } = require('../../utils');
const controller = require('./auth.controller');

const router = express.Router();

router.post('/register', registerLimiter, asyncHandler(controller.register));
router.post('/verify-otp', verifyOtpLimiter, asyncHandler(controller.verifyOtp));
router.post('/resend-otp', resendOtpLimiter, asyncHandler(controller.resendOtp));
router.post('/login', loginLimiter, asyncHandler(controller.login));
router.post('/oauth/exchange', oauthExchangeLimiter, asyncHandler(controller.exchangeOAuthCode));
router.get('/me', authMiddleware, asyncHandler(controller.getMe));
router.post('/deactivate', authMiddleware, asyncHandler(controller.deactivate));

router.post('/forgot-password', forgotPasswordLimiter, asyncHandler(controller.forgotPassword));
router.post('/resend-reset-otp', resendResetOtpLimiter, asyncHandler(controller.resendResetOtp));
router.post('/verify-reset-otp', verifyResetOtpLimiter, asyncHandler(controller.verifyResetOtp));
router.post('/reset-password', resetPasswordLimiter, asyncHandler(controller.resetPassword));

// 1. Redirect to Google
// Guards against OAuth login CSRF (an attacker tricking a victim's browser
// into completing a Google login the attacker initiated, silently binding
// the victim's session to the attacker's account). We run passport with
// { session: false } (JWT-based auth), so its default session-backed state
// store isn't available — instead we mint our own random `state`, bind it to
// this browser via a short-lived httpOnly cookie, and require the value
// Google echoes back on /google/callback to match that cookie.
const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

router.get('/google', (req, res, next) => {
  const state = crypto.randomBytes(24).toString('hex');
  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: OAUTH_STATE_TTL_MS,
  });

  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly', // Needed for email tracking
    ],
    accessType: 'offline',
    prompt: 'consent',
    state,
  })(req, res, next);
});

// 2. Google OAuth Callback
router.get(
  '/google/callback',
  (req, res, next) => {
    const cookieState = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE);
    if (!cookieState || cookieState !== req.query.state) {
      return res.redirect(`${env.clientUrl}/login?error=auth_failed`);
    }
    next();
  },
  passport.authenticate('google', { session: false, failureRedirect: `${env.clientUrl}/login?error=auth_failed` }),
  controller.googleCallback
);

module.exports = router;
