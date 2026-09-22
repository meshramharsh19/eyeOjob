// Integration test: mounts the real ai-providers router (real auth
// middleware + real rate limiters) with the controller mocked, mirroring
// authRoutes.integration.test.js's approach. Verifies:
//   - every route requires auth (401 without a token)
//   - the service layer is called with req.user.id, never a client-supplied
//     user id — the actual IDOR protection lives in the repository's
//     user_id-scoped SQL (see aiProvidersRepository.test.js), but this
//     confirms the controller never lets a client override whose data it acts on
//   - /connect, /validate, and /:id/test are rate-limited independently of
//     each other and of the general endpoints

jest.mock('../src/modules/ai-providers/ai-providers.service');

const jwt = require('jsonwebtoken');
const express = require('express');
const request = require('supertest');
const env = require('../src/config/env');
const aiProviderRoutes = require('../src/modules/ai-providers/ai-providers.routes');
const service = require('../src/modules/ai-providers/ai-providers.service');
const rateLimitConfig = require('../src/config/rateLimit');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/ai', aiProviderRoutes);
  return app;
};

const tokenFor = (userId) => jwt.sign({ id: userId }, env.jwt.secret, { expiresIn: '1h' });

beforeEach(() => {
  jest.clearAllMocks();
  service.getCatalog.mockReturnValue([]);
  service.listConnected.mockResolvedValue([]);
  service.getSetupInfo.mockReturnValue({});
  service.validateCredential.mockResolvedValue({ valid: true, latencyMs: 10 });
  service.connect.mockResolvedValue({ id: 1, provider: 'groq' });
  service.updateModel.mockResolvedValue({});
  service.testStored.mockResolvedValue({ valid: true });
  service.setPriorities.mockResolvedValue([]);
  service.disconnect.mockResolvedValue(undefined);
  service.getMonthlyUsage.mockResolvedValue({});
  service.getUsageSummary.mockResolvedValue({});
});

describe('auth is required on every route', () => {
  test.each([
    ['get', '/ai/providers'],
    ['get', '/ai/providers/connected'],
    ['put', '/ai/providers/priorities'],
    ['get', '/ai/providers/groq/setup'],
    ['post', '/ai/providers/groq/validate'],
    ['post', '/ai/providers/groq/connect'],
    ['patch', '/ai/providers/1'],
    ['post', '/ai/providers/1/test'],
    ['delete', '/ai/providers/1'],
    ['get', '/ai/usage/monthly'],
    ['get', '/ai/usage'],
  ])('%s %s returns 401 with no token', async (method, path) => {
    const app = buildApp();
    const res = await request(app)[method](path);
    expect(res.status).toBe(401);
  });
});

describe('IDOR protection — controller always uses req.user.id, never a client-supplied id', () => {
  test('GET /ai/providers/connected passes the authenticated user id from the JWT, not from the body/query', async () => {
    const app = buildApp();
    await request(app)
      .get('/ai/providers/connected')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .query({ userId: 999 }); // an attacker-supplied id in the query string must be ignored

    expect(service.listConnected).toHaveBeenCalledWith(7);
  });

  test('DELETE /ai/providers/:id scopes disconnect to the authenticated user, not a body-supplied user id', async () => {
    const app = buildApp();
    await request(app)
      .delete('/ai/providers/5')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ userId: 999 });

    expect(service.disconnect).toHaveBeenCalledWith(7, '5');
  });

  test('PATCH /ai/providers/:id uses the authenticated user id', async () => {
    const app = buildApp();
    await request(app)
      .patch('/ai/providers/5')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ model: 'new-model' });

    expect(service.updateModel).toHaveBeenCalledWith(7, '5', 'new-model');
  });

  test('PUT /ai/providers/priorities uses the authenticated user id', async () => {
    const app = buildApp();
    await request(app)
      .put('/ai/providers/priorities')
      .set('Authorization', `Bearer ${tokenFor(7)}`)
      .send({ providerIds: [1, 2, 3], userId: 999 });

    expect(service.setPriorities).toHaveBeenCalledWith(7, [1, 2, 3]);
  });
});

describe('rate limiting on live-provider-call endpoints (Section 11 threat model)', () => {
  test(`POST /ai/providers/groq/connect allows ${rateLimitConfig.aiProviderConnect.max} then 429s on the next`, async () => {
    const app = buildApp();
    const token = tokenFor(1);
    const { max } = rateLimitConfig.aiProviderConnect;

    for (let i = 0; i < max; i++) {
      const res = await request(app).post('/ai/providers/groq/connect').set('Authorization', `Bearer ${token}`).send({ apiKey: 'k' });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/ai/providers/groq/connect').set('Authorization', `Bearer ${token}`).send({ apiKey: 'k' });
    expect(blocked.status).toBe(429);
  });

  test(`POST /ai/providers/groq/validate allows ${rateLimitConfig.aiProviderValidate.max} then 429s on the next`, async () => {
    const app = buildApp();
    const token = tokenFor(2);
    const { max } = rateLimitConfig.aiProviderValidate;

    for (let i = 0; i < max; i++) {
      const res = await request(app).post('/ai/providers/groq/validate').set('Authorization', `Bearer ${token}`).send({ apiKey: 'k' });
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/ai/providers/groq/validate').set('Authorization', `Bearer ${token}`).send({ apiKey: 'k' });
    expect(blocked.status).toBe(429);
  });

  test('the connect limiter and validate limiter have independent counters', async () => {
    const app = buildApp();
    const token = tokenFor(3);
    const { max } = rateLimitConfig.aiProviderConnect;

    for (let i = 0; i < max; i++) {
      await request(app).post('/ai/providers/groq/connect').set('Authorization', `Bearer ${token}`).send({ apiKey: 'k' });
    }
    const connectBlocked = await request(app).post('/ai/providers/groq/connect').set('Authorization', `Bearer ${token}`).send({ apiKey: 'k' });
    expect(connectBlocked.status).toBe(429);

    // /validate should be entirely unaffected by /connect's exhausted limiter.
    const validateRes = await request(app).post('/ai/providers/groq/validate').set('Authorization', `Bearer ${token}`).send({ apiKey: 'k' });
    expect(validateRes.status).toBe(200);
  });

  test('two different users get independent connect-limiter buckets (keyed by user id, not shared IP)', async () => {
    const app = buildApp();
    const { max } = rateLimitConfig.aiProviderConnect;

    for (let i = 0; i < max; i++) {
      await request(app).post('/ai/providers/groq/connect').set('Authorization', `Bearer ${tokenFor(101)}`).send({ apiKey: 'k' });
    }
    const user101Blocked = await request(app).post('/ai/providers/groq/connect').set('Authorization', `Bearer ${tokenFor(101)}`).send({ apiKey: 'k' });
    expect(user101Blocked.status).toBe(429);

    // A different authenticated user, same supertest "IP", must not be blocked by user 101's exhausted bucket.
    const user202Res = await request(app).post('/ai/providers/groq/connect').set('Authorization', `Bearer ${tokenFor(202)}`).send({ apiKey: 'k' });
    expect(user202Res.status).toBe(200);
  });

  test('unrelated routes (e.g. GET /ai/providers) are not rate-limited by the connect/validate limiters', async () => {
    const app = buildApp();
    const token = tokenFor(4);
    const { max } = rateLimitConfig.aiProviderConnect;

    for (let i = 0; i < max + 3; i++) {
      const res = await request(app).get('/ai/providers').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    }
  });
});
