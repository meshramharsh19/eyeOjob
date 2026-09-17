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
} = require('../../middlewares/rateLimiter.middleware');
const { asyncHandler } = require('../../utils');
const controller = require('./auth.controller');

const router = express.Router();

router.post('/register', registerLimiter, asyncHandler(controller.register));
router.post('/verify-otp', verifyOtpLimiter, asyncHandler(controller.verifyOtp));
router.post('/resend-otp', resendOtpLimiter, asyncHandler(controller.resendOtp));
router.post('/login', loginLimiter, asyncHandler(controller.login));
router.get('/me', authMiddleware, asyncHandler(controller.getMe));

// Dead-code preserved from the original implementation: the endpoint that populated
// this token store was commented out, so this route always returns "expired or invalid".
// Kept as-is (not resurrected) since it's outside the scope of this restructure.
const resetTokenStore = new Map();
router.get('/verify-reset-token', (req, res) => {
  const { token } = req.query;
  const stored = resetTokenStore.get(token);
  if (!stored || Date.now() > stored.expiresAt) {
    return res.status(400).json({ error: 'Reset link expired or invalid' });
  }
  res.json({ email: stored.email, valid: true });
});

router.post('/forgot-password', forgotPasswordLimiter, asyncHandler(controller.forgotPassword));
router.post('/resend-reset-otp', resendResetOtpLimiter, asyncHandler(controller.resendResetOtp));
router.post('/verify-reset-otp', verifyResetOtpLimiter, asyncHandler(controller.verifyResetOtp));
router.post('/reset-password', resetPasswordLimiter, asyncHandler(controller.resetPassword));

// 1. Redirect to Google
router.get(
  '/google',
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly', // Needed for email tracking
    ],
    accessType: 'offline',
    prompt: 'consent',
  })
);

// 2. Google OAuth Callback
router.get(
  '/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${env.clientUrl}/login?error=auth_failed` }),
  controller.googleCallback
);

module.exports = router;
