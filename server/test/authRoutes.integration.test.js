// Integration test: mounts the real auth router (real rate-limit middleware,
// real route wiring) with the controller mocked out, so this verifies the
// limiter is actually attached to each route at the configured threshold
// without needing a live DB/mailer.

jest.mock('../src/modules/auth/auth.controller', () => ({
  register: (req, res) => res.json({ message: 'OTP sent successfully', email: req.body.email }),
  verifyOtp: (req, res) => res.json({ message: 'Email verified! You can now login.' }),
  resendOtp: (req, res) => res.json({ message: 'OTP resent!' }),
  login: (req, res) => res.json({ token: 'fake-token' }),
  getMe: (req, res) => res.json({ user: {} }),
  forgotPassword: (req, res) => res.json({ message: 'If an account with this email exists, an OTP has been sent.' }),
  resendResetOtp: (req, res) => res.json({ message: 'OTP resent!' }),
  verifyResetOtp: (req, res) => res.json({ message: 'OTP verified' }),
  resetPassword: (req, res) => res.json({ message: 'Password reset successfully! You can now login.' }),
  googleCallback: (req, res) => res.redirect('/'),
}));

const express = require('express');
const request = require('supertest');
const authRoutes = require('../src/modules/auth/auth.routes');
const rateLimitConfig = require('../src/config/rateLimit');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  return app;
};

describe('auth routes — rate limiting wired end-to-end', () => {
  test('POST /auth/resend-otp (max 3/window by default) allows 3 then 429s on the 4th', async () => {
    const app = buildApp();
    const { max } = rateLimitConfig.resendOtp;

    for (let i = 0; i < max; i++) {
      const res = await request(app).post('/auth/resend-otp').send({ email: 'a@b.com' });
      expect(res.status).toBe(200);
    }

    const blocked = await request(app).post('/auth/resend-otp').send({ email: 'a@b.com' });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'Too many requests. Please try again later.' });
  });

  test('POST /auth/login and POST /auth/resend-otp have independent counters', async () => {
    const app = buildApp();
    const { max } = rateLimitConfig.resendOtp;

    // Exhaust /resend-otp's limiter.
    for (let i = 0; i < max; i++) {
      await request(app).post('/auth/resend-otp').send({ email: 'a@b.com' });
    }
    const otpBlocked = await request(app).post('/auth/resend-otp').send({ email: 'a@b.com' });
    expect(otpBlocked.status).toBe(429);

    // /login should be entirely unaffected.
    const loginRes = await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'x' });
    expect(loginRes.status).toBe(200);
  });

  test('GET /auth/me (not a rate-limited route) is unaffected regardless of auth routes traffic', async () => {
    const app = buildApp();
    const res = await request(app).get('/auth/me');
    // No token supplied — real authMiddleware still runs (not mocked), so this
    // is a 401 from the auth check, never a 429 from a stray limiter.
    expect(res.status).toBe(401);
  });
});
