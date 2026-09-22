// Error taxonomy + adapter normalization (Section 9, Project DOCs/BYOK.md) —
// verifies HTTP status codes map to the right normalized code/retryable
// flag, since the gateway's chain-advance and provider-status-update logic
// depends entirely on these being correct.

const { classifyHttpStatus, AIProviderError, QuotaExceededError } = require('../src/modules/ai-providers/errors/ai.errors');
const BaseAIProvider = require('../src/modules/ai-providers/adapters/base.adapter');

describe('classifyHttpStatus', () => {
  test.each([
    [401, 'INVALID_CREDENTIAL', false],
    [403, 'AUTHORIZATION_FAILED', false],
    [429, 'RATE_LIMITED', true],
    [402, 'QUOTA_EXCEEDED', false],
    [400, 'UNSUPPORTED_MODEL', false],
    [404, 'UNSUPPORTED_MODEL', false],
    [500, 'PROVIDER_UNAVAILABLE', true],
    [502, 'PROVIDER_UNAVAILABLE', true],
    [503, 'PROVIDER_UNAVAILABLE', true],
    [504, 'PROVIDER_UNAVAILABLE', true],
    [418, 'UNKNOWN_PROVIDER_ERROR', false],
    [undefined, 'UNKNOWN_PROVIDER_ERROR', false],
  ])('status %s -> code %s, retryable %s', (status, expectedCode, expectedRetryable) => {
    const { code, retryable } = classifyHttpStatus(status);
    expect(code).toBe(expectedCode);
    expect(retryable).toBe(expectedRetryable);
  });
});

describe('AIProviderError', () => {
  test('carries code, retryable, and statusCode', () => {
    const err = new AIProviderError('RATE_LIMITED', 'slow down', { retryable: true, statusCode: 429 });
    expect(err.code).toBe('RATE_LIMITED');
    expect(err.retryable).toBe(true);
    expect(err.statusCode).toBe(429);
    expect(err.message).toBe('slow down');
  });

  test('defaults retryable to false and statusCode to 502', () => {
    const err = new AIProviderError('UNKNOWN_PROVIDER_ERROR', 'oops');
    expect(err.retryable).toBe(false);
    expect(err.statusCode).toBe(502);
  });
});

describe('QuotaExceededError', () => {
  test('carries userId/cap/used and a 402 status', () => {
    const err = new QuotaExceededError({ userId: 7, cap: 150, used: 150 });
    expect(err.code).toBe('QUOTA_EXCEEDED');
    expect(err.userId).toBe(7);
    expect(err.cap).toBe(150);
    expect(err.used).toBe(150);
    expect(err.statusCode).toBe(402);
  });
});

// A minimal concrete adapter for exercising the base class's shared
// extract()/validate()/normalizeError() behavior without hitting a real API.
class FakeAdapter extends BaseAIProvider {
  constructor() { super({ id: 'fake', displayName: 'Fake', defaultModel: 'fake-model' }); }
  async _call(apiKey, model, prompt) {
    if (apiKey === 'bad-key') {
      const err = new Error('Unauthorized');
      err.status = 401;
      throw err;
    }
    return { json: { intent: 'other', ok: true }, usage: { totalTokens: 5 } };
  }
}

describe('BaseAIProvider (shared adapter contract)', () => {
  test('extract() builds a prompt and returns the underlying { json, usage }', async () => {
    const adapter = new FakeAdapter();
    const result = await adapter.extract('good-key', null, 'Subject', 'Body text', 'sender@x.com', new Date());
    expect(result.json).toEqual({ intent: 'other', ok: true });
    expect(result.usage.totalTokens).toBe(5);
  });

  test('extract() falls back to defaultModel when no model is passed', async () => {
    const adapter = new FakeAdapter();
    const spy = jest.spyOn(adapter, '_call');
    await adapter.extract('good-key', null, 'Subject', 'Body', 'sender@x.com', null);
    expect(spy).toHaveBeenCalledWith('good-key', 'fake-model', expect.any(String));
  });

  test('extract() normalizes a thrown error via normalizeError()', async () => {
    const adapter = new FakeAdapter();
    await expect(adapter.extract('bad-key', null, 'S', 'B', 's', null)).rejects.toMatchObject({
      code: 'INVALID_CREDENTIAL', retryable: false,
    });
  });

  test('validate() uses a lightweight health-check prompt and reports latency', async () => {
    const adapter = new FakeAdapter();
    const result = await adapter.validate('good-key', null);
    expect(result.valid).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
  });

  test('validate() normalizes errors the same way as extract()', async () => {
    const adapter = new FakeAdapter();
    await expect(adapter.validate('bad-key', null)).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL' });
  });

  test('a subclass that does not implement _call throws clearly', async () => {
    class Incomplete extends BaseAIProvider {
      constructor() { super({ id: 'incomplete', displayName: 'x', defaultModel: 'm' }); }
    }
    const adapter = new Incomplete();
    await expect(adapter.extract('k', null, 's', 'b', 'sender', null)).rejects.toThrow();
  });
});
