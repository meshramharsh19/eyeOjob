const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const authService = require('./auth.service');

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

// Handles the Passport Google OAuth callback (req.user is populated by passport).
const googleCallback = (req, res) => {
  const user = req.user;
  const token = jwt.sign(
    { id: user.id, email: user.email },
    env.jwt.secret,
    { expiresIn: '7d' }
  );

  const userData = encodeURIComponent(
    JSON.stringify({ id: user.id, name: user.name, email: user.email, avatar: user.avatar })
  );

  res.redirect(`${env.clientUrl}/auth-success?token=${token}&user=${userData}`);
};

module.exports = {
  register,
  verifyOtp,
  resendOtp,
  login,
  getMe,
  forgotPassword,
  resendResetOtp,
  verifyResetOtp,
  resetPassword,
  googleCallback,
};
