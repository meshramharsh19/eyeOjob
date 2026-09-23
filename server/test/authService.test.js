// Unit tests for the auth service's login-failure counter and the
// account-enumeration fixes (login + forgotPassword). Repositories are
// mocked so these run without a live MySQL connection.

// Explicit mock factories (rather than bare jest.mock(path) automocking) so
// the real files — which pull in config/database.js and open a real MySQL
// connection at module load — never actually get required.
jest.mock('../src/modules/auth/auth.repository', () => ({
  findByEmail: jest.fn(),
  findPublicById: jest.fn(),
  createUser: jest.fn(),
  updatePassword: jest.fn(),
  reactivateUser: jest.fn(),
}));
jest.mock('../src/modules/auth/otp.repository', () => ({
  upsertSignupOtp: jest.fn(),
  findSignupOtp: jest.fn(),
  deleteSignupOtp: jest.fn(),
  upsertResetOtp: jest.fn(),
  findResetOtp: jest.fn(),
  deleteResetOtp: jest.fn(),
}));
jest.mock('../src/modules/auth/login-failure.repository', () => ({
  find: jest.fn(),
  recordFailure: jest.fn(),
  reset: jest.fn(),
}));
jest.mock('../src/config/mailer', () => ({
  sendOtpEmail: jest.fn(),
  sendResetOtpEmail: jest.fn(),
}));
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

const bcrypt = require('bcryptjs');
const authRepository = require('../src/modules/auth/auth.repository');
const otpRepository = require('../src/modules/auth/otp.repository');
const loginFailureRepository = require('../src/modules/auth/login-failure.repository');
const mailer = require('../src/config/mailer');
const authService = require('../src/modules/auth/auth.service');

const VERIFIED_USER = {
  id: 1,
  email: 'user@example.com',
  name: 'Test User',
  password: 'hashed-password',
  is_verified: 1,
  is_active: 1,
  avatar: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  loginFailureRepository.find.mockResolvedValue(null);
  loginFailureRepository.recordFailure.mockResolvedValue(1);
  loginFailureRepository.reset.mockResolvedValue();
  authRepository.reactivateUser.mockResolvedValue();
});

describe('auth.service login — account enumeration', () => {
  test('nonexistent account and wrong password produce the identical error message', async () => {
    authRepository.findByEmail.mockResolvedValueOnce(null);
    let errA;
    try {
      await authService.login({ email: 'ghost@example.com', password: 'whatever' });
    } catch (e) { errA = e; }

    authRepository.findByEmail.mockResolvedValueOnce(VERIFIED_USER);
    bcrypt.compare.mockResolvedValueOnce(false);
    let errB;
    try {
      await authService.login({ email: 'user@example.com', password: 'wrong-password' });
    } catch (e) { errB = e; }

    expect(errA.message).toBe(errB.message);
    expect(errA.statusCode).toBe(401);
    expect(errB.statusCode).toBe(401);
  });

  test('a Google-only account (no password set) gets the same generic message, not "login with Google"', async () => {
    authRepository.findByEmail.mockResolvedValueOnce({ ...VERIFIED_USER, password: null });

    await expect(authService.login({ email: 'user@example.com', password: 'anything' }))
      .rejects.toMatchObject({ message: 'Invalid email or password', statusCode: 401 });
  });

  test('every failure path records a login failure for future rate-limiting', async () => {
    authRepository.findByEmail.mockResolvedValueOnce(null);
    await expect(authService.login({ email: 'ghost@example.com', password: 'x' })).rejects.toThrow();
    expect(loginFailureRepository.recordFailure).toHaveBeenCalledWith('ghost@example.com', expect.any(Number));
  });
});

describe('auth.service login — account-level failure counter', () => {
  test('a successful login resets the failure counter', async () => {
    authRepository.findByEmail.mockResolvedValueOnce(VERIFIED_USER);
    bcrypt.compare.mockResolvedValueOnce(true);

    const result = await authService.login({ email: 'user@example.com', password: 'correct-password' });

    expect(result.token).toEqual(expect.any(String));
    expect(loginFailureRepository.reset).toHaveBeenCalledWith('user@example.com');
  });

  test('once the failure count is at/above the configured max within the window, login is blocked with 429 before touching the DB/bcrypt', async () => {
    loginFailureRepository.find.mockResolvedValueOnce({
      failed_count: 5, // matches the default AUTH_LOGIN_FAILURE_LIMIT
      first_failed_at: new Date(), // well within the window
    });

    await expect(authService.login({ email: 'user@example.com', password: 'x' }))
      .rejects.toMatchObject({ statusCode: 429, message: expect.stringMatching(/too many/i) });

    expect(authRepository.findByEmail).not.toHaveBeenCalled();
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('a failure count from an expired window does not block login', async () => {
    loginFailureRepository.find.mockResolvedValueOnce({
      failed_count: 5,
      first_failed_at: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago — outside any reasonable window
    });
    authRepository.findByEmail.mockResolvedValueOnce(VERIFIED_USER);
    bcrypt.compare.mockResolvedValueOnce(true);

    const result = await authService.login({ email: 'user@example.com', password: 'correct-password' });
    expect(result.token).toEqual(expect.any(String));
  });

  test('an unverified account is still told to verify — this message requires already knowing the correct password, so it does not enable enumeration', async () => {
    authRepository.findByEmail.mockResolvedValueOnce({ ...VERIFIED_USER, is_verified: 0 });
    bcrypt.compare.mockResolvedValueOnce(true);

    await expect(authService.login({ email: 'user@example.com', password: 'correct-password' }))
      .rejects.toMatchObject({ message: 'Please verify your email first' });
  });
});

describe('auth.service forgotPassword — account enumeration', () => {
  test('resolves without error for a nonexistent account, and sends no email', async () => {
    authRepository.findByEmail.mockResolvedValueOnce(null);

    await expect(authService.forgotPassword({ email: 'ghost@example.com' })).resolves.toBeUndefined();
    expect(mailer.sendResetOtpEmail).not.toHaveBeenCalled();
    expect(otpRepository.upsertResetOtp).not.toHaveBeenCalled();
  });

  test('sends an OTP for an existing account', async () => {
    authRepository.findByEmail.mockResolvedValueOnce(VERIFIED_USER);

    await authService.forgotPassword({ email: 'user@example.com' });

    expect(otpRepository.upsertResetOtp).toHaveBeenCalledWith(expect.objectContaining({ email: 'user@example.com' }));
    expect(mailer.sendResetOtpEmail).toHaveBeenCalled();
  });
});
