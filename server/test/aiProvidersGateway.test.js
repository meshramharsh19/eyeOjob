// ai-providers.gateway.js — the core resolution/extraction decision point
// (Project DOCs/BYOK.md, Section 3.2/5). Repository, adapters, the server
// chain (ai.extractor.js), and notifications are all mocked so this tests
// pure gateway logic: which branch resolveChain() takes, that BYOK never
// falls back to server keys, and that quota is only touched for the
// MANAGED_FREE branch.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/modules/ai-providers/ai-providers.repository');
jest.mock('../src/modules/ai-providers/adapters', () => ({
  groq: { extract: jest.fn() },
  gemini: { extract: jest.fn() },
}));
jest.mock('../src/modules/ai-providers/security/encryption.service', () => ({
  decrypt: jest.fn((v) => `decrypted:${v}`),
}));
jest.mock('../src/pipelines/email-pipeline/extraction/ai.extractor', () => ({
  extractJobDetails: jest.fn(),
}));
jest.mock('../src/modules/notifications/notifications.service', () => ({
  notifyQuotaExceeded: jest.fn(),
}));

const repository = require('../src/modules/ai-providers/ai-providers.repository');
const adapters = require('../src/modules/ai-providers/adapters');
const encryptionService = require('../src/modules/ai-providers/security/encryption.service');
const { extractJobDetails } = require('../src/pipelines/email-pipeline/extraction/ai.extractor');
const notificationsService = require('../src/modules/notifications/notifications.service');
const { QuotaExceededError, AIProviderError } = require('../src/modules/ai-providers/errors/ai.errors');
const gateway = require('../src/modules/ai-providers/ai-providers.gateway');

const USER_ID = 7;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveChain', () => {
  test('returns BYOK when the user has at least one CONNECTED provider', async () => {
    repository.getConnectedProviders.mockResolvedValue([{ id: 1, provider: 'groq', model: 'x', priority: 0 }]);

    const resolution = await gateway.resolveChain(USER_ID);

    expect(resolution.source).toBe('BYOK');
    expect(resolution.userProviders).toHaveLength(1);
    expect(repository.getSubscription).not.toHaveBeenCalled(); // short-circuits before any managed-tier lookup
  });

  test('returns MANAGED_UNLIMITED when subscription.has_managed_ai is true', async () => {
    repository.getConnectedProviders.mockResolvedValue([]);
    repository.getSubscription.mockResolvedValue({ plan: 'pro', has_managed_ai: 1, monthly_call_cap: null });

    const resolution = await gateway.resolveChain(USER_ID);

    expect(resolution.source).toBe('MANAGED_UNLIMITED');
    expect(repository.getOrCreateMonthlyUsage).not.toHaveBeenCalled();
  });

  test('returns MANAGED_FREE when under the cap', async () => {
    repository.getConnectedProviders.mockResolvedValue([]);
    repository.getSubscription.mockResolvedValue({ plan: 'free', has_managed_ai: 0, monthly_call_cap: null });
    repository.getOrCreateMonthlyUsage.mockResolvedValue({ calls_used: 10, quota_notified: 0 });

    const resolution = await gateway.resolveChain(USER_ID);

    expect(resolution.source).toBe('MANAGED_FREE');
    expect(resolution.cap).toBe(150); // env default
  });

  test('throws QuotaExceededError once calls_used reaches the cap', async () => {
    repository.getConnectedProviders.mockResolvedValue([]);
    repository.getSubscription.mockResolvedValue({ plan: 'free', has_managed_ai: 0, monthly_call_cap: null });
    repository.getOrCreateMonthlyUsage.mockResolvedValue({ calls_used: 150, quota_notified: 0 });

    await expect(gateway.resolveChain(USER_ID)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  test('respects a per-user monthly_call_cap override on the subscription row', async () => {
    repository.getConnectedProviders.mockResolvedValue([]);
    repository.getSubscription.mockResolvedValue({ plan: 'free', has_managed_ai: 0, monthly_call_cap: 5 });
    repository.getOrCreateMonthlyUsage.mockResolvedValue({ calls_used: 5, quota_notified: 0 });

    await expect(gateway.resolveChain(USER_ID)).rejects.toThrow();
  });
});

describe('extract — BYOK chain isolation (Section 5.3)', () => {
  test('a single connected provider succeeds and logs a BYOK usage row', async () => {
    repository.getConnectedProviders.mockResolvedValue([
      { id: 1, provider: 'groq', model: 'm1', priority: 0, encrypted_credential: 'enc1' },
    ]);
    adapters.groq.extract.mockResolvedValue({ json: { intent: 'application_confirmation' }, usage: { totalTokens: 10 } });

    const result = await gateway.extract(USER_ID, 'subj', 'body', 'sender', null, null);

    expect(result).toEqual({ intent: 'application_confirmation' });
    expect(encryptionService.decrypt).toHaveBeenCalledWith('enc1');
    expect(repository.logUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID, provider: 'groq', source: 'BYOK', success: true }));
    expect(repository.markUsed).toHaveBeenCalledWith(1);
  });

  test('falls through to the next provider in priority order on failure', async () => {
    repository.getConnectedProviders.mockResolvedValue([
      { id: 1, provider: 'groq', model: 'm1', priority: 0, encrypted_credential: 'enc1' },
      { id: 2, provider: 'gemini', model: 'm2', priority: 1, encrypted_credential: 'enc2' },
    ]);
    adapters.groq.extract.mockRejectedValue(new AIProviderError('INVALID_CREDENTIAL', 'bad key', { retryable: false, statusCode: 401 }));
    adapters.gemini.extract.mockResolvedValue({ json: { intent: 'interview' }, usage: null });

    const result = await gateway.extract(USER_ID, 'subj', 'body', 'sender', null, null);

    expect(result).toEqual({ intent: 'interview' });
    expect(adapters.groq.extract).toHaveBeenCalled();
    expect(adapters.gemini.extract).toHaveBeenCalled();
    // Permanent failure marks the row so the settings UI can surface it.
    expect(repository.markFailed).toHaveBeenCalledWith(1, 'INVALID', 'INVALID_CREDENTIAL', 'bad key');
  });

  test('all connected providers failing throws — NEVER silently falls back to the server chain', async () => {
    repository.getConnectedProviders.mockResolvedValue([
      { id: 1, provider: 'groq', model: 'm1', priority: 0, encrypted_credential: 'enc1' },
    ]);
    adapters.groq.extract.mockRejectedValue(new AIProviderError('RATE_LIMITED', 'slow down', { retryable: true, statusCode: 429 }));

    await expect(gateway.extract(USER_ID, 'subj', 'body', 'sender', null, null)).rejects.toThrow('slow down');
    expect(extractJobDetails).not.toHaveBeenCalled(); // the whole point of Section 5.3
  });

  test('a retryable (transient) failure leaves the provider row CONNECTED, not marked failed', async () => {
    repository.getConnectedProviders.mockResolvedValue([
      { id: 1, provider: 'groq', model: 'm1', priority: 0, encrypted_credential: 'enc1' },
    ]);
    adapters.groq.extract.mockRejectedValue(new AIProviderError('RATE_LIMITED', 'slow down', { retryable: true, statusCode: 429 }));

    await expect(gateway.extract(USER_ID, 'subj', 'body', 'sender', null, null)).rejects.toThrow();
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  test('a connected provider with no matching adapter is skipped, not fatal', async () => {
    repository.getConnectedProviders.mockResolvedValue([
      { id: 1, provider: 'unknown-provider', model: 'm1', priority: 0, encrypted_credential: 'enc1' },
      { id: 2, provider: 'groq', model: 'm2', priority: 1, encrypted_credential: 'enc2' },
    ]);
    adapters.groq.extract.mockResolvedValue({ json: { intent: 'offer' }, usage: null });

    const result = await gateway.extract(USER_ID, 'subj', 'body', 'sender', null, null);
    expect(result).toEqual({ intent: 'offer' });
  });
});

describe('extract — managed tier (no BYOK provider configured)', () => {
  test('MANAGED_FREE: increments monthly usage only after a successful extraction', async () => {
    repository.getConnectedProviders.mockResolvedValue([]);
    repository.getSubscription.mockResolvedValue({ plan: 'free', has_managed_ai: 0, monthly_call_cap: null });
    repository.getOrCreateMonthlyUsage.mockResolvedValue({ calls_used: 3, quota_notified: 0 });
    extractJobDetails.mockResolvedValue({ intent: 'application_confirmation', extractionFailed: false });

    await gateway.extract(USER_ID, 'subj', 'body', 'sender', null, null);

    expect(repository.incrementMonthlyUsage).toHaveBeenCalledWith(USER_ID, expect.any(String));
  });

  test('MANAGED_FREE: does NOT increment usage when every provider failed (extractionFailed)', async () => {
    repository.getConnectedProviders.mockResolvedValue([]);
    repository.getSubscription.mockResolvedValue({ plan: 'free', has_managed_ai: 0, monthly_call_cap: null });
    repository.getOrCreateMonthlyUsage.mockResolvedValue({ calls_used: 3, quota_notified: 0 });
    extractJobDetails.mockResolvedValue({ intent: 'other', extractionFailed: true });

    await gateway.extract(USER_ID, 'subj', 'body', 'sender', null, null);

    expect(repository.incrementMonthlyUsage).not.toHaveBeenCalled();
  });

  test('MANAGED_UNLIMITED: never touches monthly usage at all', async () => {
    repository.getConnectedProviders.mockResolvedValue([]);
    repository.getSubscription.mockResolvedValue({ plan: 'pro', has_managed_ai: 1, monthly_call_cap: null });
    extractJobDetails.mockResolvedValue({ intent: 'application_confirmation', extractionFailed: false });

    await gateway.extract(USER_ID, 'subj', 'body', 'sender', null, null);

    expect(repository.incrementMonthlyUsage).not.toHaveBeenCalled();
    expect(repository.getOrCreateMonthlyUsage).not.toHaveBeenCalled();
  });

  test('a QuotaExceededError from resolveChain propagates out of extract() untouched', async () => {
    repository.getConnectedProviders.mockResolvedValue([]);
    repository.getSubscription.mockResolvedValue({ plan: 'free', has_managed_ai: 0, monthly_call_cap: null });
    repository.getOrCreateMonthlyUsage.mockResolvedValue({ calls_used: 150, quota_notified: 0 });

    await expect(gateway.extract(USER_ID, 'subj', 'body', 'sender', null, null)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(extractJobDetails).not.toHaveBeenCalled();
  });

  test('logs a usage row per provider the server chain attempted, attributed via stats.aiProviderStats delta', async () => {
    repository.getConnectedProviders.mockResolvedValue([]);
    repository.getSubscription.mockResolvedValue({ plan: 'free', has_managed_ai: 0, monthly_call_cap: null });
    repository.getOrCreateMonthlyUsage.mockResolvedValue({ calls_used: 0, quota_notified: 0 });

    const stats = { aiProviderStats: { Gemini: { calls: 0, ms: 0, failures: 0 } } };
    extractJobDetails.mockImplementation(async () => {
      // Simulate ai.extractor.js's recordProviderCall mutating the shared stats object.
      stats.aiProviderStats.Gemini = { calls: 1, ms: 500, failures: 0 };
      return { intent: 'application_confirmation', extractionFailed: false };
    });

    await gateway.extract(USER_ID, 'subj', 'body', 'sender', stats, null);

    expect(repository.logUsage).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID, provider: 'gemini', source: 'MANAGED_FREE', success: true, latencyMs: 500,
    }));
  });
});

describe('notifyQuotaOnce — debounce', () => {
  test('fires the notification and sets quota_notified when not yet notified', async () => {
    repository.getOrCreateMonthlyUsage.mockResolvedValue({ calls_used: 150, quota_notified: 0 });

    await gateway.notifyQuotaOnce(USER_ID, '2026-09');

    expect(notificationsService.notifyQuotaExceeded).toHaveBeenCalledWith({ userId: USER_ID });
    expect(repository.markQuotaNotified).toHaveBeenCalledWith(USER_ID, '2026-09');
  });

  test('is a no-op when already notified this month', async () => {
    repository.getOrCreateMonthlyUsage.mockResolvedValue({ calls_used: 150, quota_notified: 1 });

    await gateway.notifyQuotaOnce(USER_ID, '2026-09');

    expect(notificationsService.notifyQuotaExceeded).not.toHaveBeenCalled();
    expect(repository.markQuotaNotified).not.toHaveBeenCalled();
  });
});
