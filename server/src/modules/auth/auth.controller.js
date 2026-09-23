const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const authService = require('./auth.service');
const { BadRequestError } = require('../../errors');
const { createTtlMap } = require('../../utils/ttlMap');

const register = async (req, res) => {
  await authService.register(req.body);
  res.json({ message: 'OTP sent successfully', email: req.body.email });
};

const verifyOtp = async (req, res) => {
  await authService.verifyOtp(req.body);
  res.json({ message: 'Email verified! You can now login.' });
};

const resendOtp = async (req, res) => {
  await authService.resendOtp(req.body);
  res.json({ message: 'OTP resent!' });
};

const login = async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
};

const getMe = async (req, res) => {
  const user = await authService.getMe(req.user.id);
  res.json({ user });
};

const deactivate = async (req, res) => {
  await authService.deactivate(req.user.id);
  res.json({ message: 'Account deactivated. Log in again anytime to reactivate it.' });
};

const forgotPassword = async (req, res) => {
  await authService.forgotPassword(req.body);
  // Generic response regardless of whether the account exists — see
  // auth.service.js forgotPassword for why. The client doesn't render this
  // message, it just advances to the OTP step on any 2xx.
  res.json({ message: 'If an account with this email exists, an OTP has been sent.' });
};

const resendResetOtp = async (req, res) => {
  await authService.resendResetOtp(req.body);
  res.json({ message: 'OTP resent!' });
};

const verifyResetOtp = async (req, res) => {
  await authService.verifyResetOtp(req.body);
  res.json({ message: 'OTP verified' });
};

const resetPassword = async (req, res) => {
  await authService.resetPassword(req.body);
  res.json({ message: 'Password reset successfully! You can now login.' });
};

// One-time, short-lived OAuth handoff codes. A real JWT is never put in the
// redirect URL — putting it there would leave it in browser history, in the
// Referer header of any third-party resource the next page loads, and in
// access/CDN logs for its full lifetime. The code below is single-use and
// expires in seconds, so even if it leaks through one of those channels it's
// already worthless. See utils/ttlMap.js for the eviction/cluster caveats.
const oauthHandoffCodes = createTtlMap();
const OAUTH_CODE_TTL_MS = 60 * 1000;

const googleCallback = (req, res) => {
  const user = req.user;
  const code = crypto.randomBytes(32).toString('hex');
  oauthHandoffCodes.set(
    code,
    { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
    Date.now() + OAUTH_CODE_TTL_MS
  );

  res.redirect(`${env.clientUrl}/auth-success?code=${code}`);
};

// Exchanges a one-time OAuth handoff code for the actual JWT. Called by the
// frontend from /auth-success — keeps the real token out of the URL/history.
const exchangeOAuthCode = async (req, res) => {
  const { code } = req.body;
  const user = code ? oauthHandoffCodes.takeIfValid(code) : null;

  if (!user) {
    throw new BadRequestError('Invalid or expired login code');
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  res.json({ token, user });
};

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  getMe,
  deactivate,
  forgotPassword,
  resendResetOtp,
  verifyResetOtp,
  resetPassword,
  googleCallback,
  exchangeOAuthCode,
};
