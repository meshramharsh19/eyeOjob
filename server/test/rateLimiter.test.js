const express = require('express');
const request = require('supertest');
const { buildLimiter } = require('../src/middlewares/rateLimiter.middleware');

// Builds a minimal app around one limiter so these tests exercise the real
// express-rate-limit behavior + our 429 response shape, without needing the
// full app (DB, passport, etc.) or waiting out real-world window lengths.
const appWithLimiter = (limiterOptions) => {
  const app = express();
  app.use(buildLimiter(limiterOptions));
  app.get('/probe', (req, res) => res.json({ ok: true }));
  return app;
};

describe('rate limiter middleware', () => {
  test('requests under the limit are allowed', async () => {
    const app = appWithLimiter({ windowMs: 60_000, max: 3 });

    for (let i = 0; i < 3; i++) {
      const res = await request(app).get('/probe');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    }
  });

  test('the request past the limit gets a 429 with the expected shape', async () => {
    const app = appWithLimiter({ windowMs: 60_000, max: 2 });

    await request(app).get('/probe');
    await request(app).get('/probe');
    const res = await request(app).get('/probe');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Too many requests. Please try again later.' });
  });

  test('never returns 500/400/401/403 for an exhausted limit', async () => {
    const app = appWithLimiter({ windowMs: 60_000, max: 1 });

    await request(app).get('/probe');
    const res = await request(app).get('/probe');

    expect(res.status).toBe(429);
    expect([400, 401, 403, 500]).not.toContain(res.status);
  });

  test('the limit resets once the window elapses', async () => {
    const app = appWithLimiter({ windowMs: 200, max: 1 });

    await request(app).get('/probe');
    const blocked = await request(app).get('/probe');
    expect(blocked.status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 300));

    const afterReset = await request(app).get('/probe');
    expect(afterReset.status).toBe(200);
  });

  test('exposes standard RateLimit-* headers', async () => {
    const app = appWithLimiter({ windowMs: 60_000, max: 5 });

    const res = await request(app).get('/probe');
    expect(res.headers).toHaveProperty('ratelimit-limit');
    expect(res.headers).toHaveProperty('ratelimit-remaining');
  });

  test('two endpoints with independent limiters do not share a counter', async () => {
    const app = express();
    app.use('/login', buildLimiter({ windowMs: 60_000, max: 1 }));
    app.use('/resend-otp', buildLimiter({ windowMs: 60_000, max: 1 }));
    app.get('/login', (req, res) => res.json({ ok: true }));
    app.get('/resend-otp', (req, res) => res.json({ ok: true }));

    const loginRes1 = await request(app).get('/login');
    const loginRes2 = await request(app).get('/login'); // exhausts /login's limiter
    const otpRes = await request(app).get('/resend-otp'); // independent counter, should still be allowed

    expect(loginRes1.status).toBe(200);
    expect(loginRes2.status).toBe(429);
    expect(otpRes.status).toBe(200);
  });
});
