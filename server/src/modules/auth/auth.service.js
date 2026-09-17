const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const rateLimitConfig = require('../../config/rateLimit');
const { sendOtpEmail, sendResetOtpEmail } = require('../../config/mailer');
const { BadRequestError, UnauthorizedError, TooManyRequestsError } = require('../../errors');
const authRepository = require('./auth.repository');
const otpRepository = require('./otp.repository');
const loginFailureRepository = require('./login-failure.repository');

// OTP / reset-token storage lives in MySQL (signup_otps / password_reset_otps
// via otp.repository.js) — see migrations/add_otp_tables.sql. Previously an
// in-memory Map, which lost every pending OTP on restart and couldn't work
// across multiple server instances.

const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

const isExpired = (expiresAt) => Date.now() > new Date(expiresAt).getTime();

const register = async ({ name, email, password }) => {
  const existing = await authRepository.findByEmail(email);
  if (existing) throw new BadRequestError('Email already registered');

  const hashedPassword = await bcrypt.hash(password, 12);
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await otpRepository.upsertSignupOtp({ email, otp, name, password: hashedPassword, expiresAt });
  await sendOtpEmail(email, name, otp);
};

const verifyOtp = async ({ email, otp }) => {
  const stored = await otpRepository.findSignupOtp(email);
  if (!stored) throw new BadRequestError('OTP expired or not found. Register again.');
  if (isExpired(stored.expires_at)) {
    await otpRepository.deleteSignupOtp(email);
    throw new BadRequestError('OTP expired. Register again.');
  }
  if (stored.otp !== otp) throw new BadRequestError('Invalid OTP');

  await authRepository.createUser({ name: stored.name, email, hashedPassword: stored.password });
  await otpRepository.deleteSignupOtp(email);
};

const resendOtp = async ({ email }) => {
  const stored = await otpRepository.findSignupOtp(email);
  if (!stored) throw new BadRequestError('Session expired. Please register again.');

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await otpRepository.upsertSignupOtp({ email, otp, name: stored.name, password: stored.password, expiresAt });

  await sendOtpEmail(email, stored.name, otp);
};

// Same generic message whichever way a login attempt fails — the account
// doesn't exist, the password is wrong, or the account is Google-only (no
// password set). Distinguishing any of these tells an attacker which emails
// are registered without ever needing to guess a password (see auth.service
// forgotPassword for the same principle applied there).
const invalidCredentials = () => new UnauthorizedError('Invalid email or password');

const login = async ({ email, password }) => {
  const { windowMs, max } = rateLimitConfig.loginFailure;
  const failures = await loginFailureRepository.find(email);
  const withinWindow = failures && (Date.now() - new Date(failures.first_failed_at).getTime() <= windowMs);

  // Blocked before the DB lookup/bcrypt compare below — no point spending
  // that work on a request that's already going to be rejected.
  if (withinWindow && failures.failed_count >= max) {
    throw new TooManyRequestsError('Too many failed login attempts. Please try again later.');
  }

  const user = await authRepository.findByEmail(email);
  if (!user || !user.password) {
    await loginFailureRepository.recordFailure(email, windowMs);
    throw invalidCredentials();
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    await loginFailureRepository.recordFailure(email, windowMs);
    throw invalidCredentials();
  }
  if (!user.is_verified) throw new UnauthorizedError('Please verify your email first');

  await loginFailureRepository.reset(email);

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  return { token, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } };
};

const getMe = async (userId) => {
  const user = await authRepository.findPublicById(userId);
  if (!user) throw new UnauthorizedError('User not found');
  return user;
};

const forgotPassword = async ({ email }) => {
  const user = await authRepository.findByEmail(email);

  // Only actually send an OTP if the account exists, but resolve the same
  // way either way (see auth.controller.js forgotPassword) — throwing
  // "No account found" here would let this endpoint be used to enumerate
  // registered emails.
  if (user) {
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await otpRepository.upsertResetOtp({ email, otp, userId: user.id, name: user.name, verified: false, expiresAt });
    await sendResetOtpEmail(user.email, user.name, otp);
  }
};

const resendResetOtp = async ({ email }) => {
  const stored = await otpRepository.findResetOtp(email);
  if (!stored) throw new BadRequestError('Session expired. Please start again.');

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await otpRepository.upsertResetOtp({
    email, otp, userId: stored.user_id, name: stored.name, verified: false, expiresAt,
  });

  await sendResetOtpEmail(email, stored.name, otp);
};

const verifyResetOtp = async ({ email, otp }) => {
  const stored = await otpRepository.findResetOtp(email);
  if (!stored) throw new BadRequestError('OTP expired or not found. Please start again.');
  if (isExpired(stored.expires_at)) {
    await otpRepository.deleteResetOtp(email);
    throw new BadRequestError('OTP expired. Please request a new one.');
  }
  if (stored.otp !== otp) throw new BadRequestError('Invalid OTP');

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await otpRepository.upsertResetOtp({
    email, otp: stored.otp, userId: stored.user_id, name: stored.name, verified: true, expiresAt,
  });
};

const resetPassword = async ({ email, password }) => {
  const stored = await otpRepository.findResetOtp(email);
  if (!stored || !stored.verified) throw new BadRequestError('Please verify OTP first');
  if (isExpired(stored.expires_at)) {
    await otpRepository.deleteResetOtp(email);
    throw new BadRequestError('Session expired. Please start again.');
  }
  if (password.length < 8) throw new BadRequestError('Password must be at least 8 characters');

  const hashedPassword = await bcrypt.hash(password, 12);
  await authRepository.updatePassword(stored.user_id, hashedPassword);
  await otpRepository.deleteResetOtp(email);
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
};
