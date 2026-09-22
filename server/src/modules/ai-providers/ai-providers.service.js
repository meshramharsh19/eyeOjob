const logger = require('../../config/logger');
const env = require('../../config/env');
const repository = require('./ai-providers.repository');
const adapters = require('./adapters');
const providersConfig = require('./config/providers.config');
const encryptionService = require('./security/encryption.service');
const { BadRequestError, NotFoundError } = require('../../errors');
const { AIProviderError } = require('./errors/ai.errors');
const { currentUtcYearMonth } = require('./ai-providers.gateway');

const getCatalog = () => Object.values(providersConfig).map(({ id, displayName, tagline, description, setupUrl, docsUrl, supportedModels, defaultModel, credentialType }) => (
  { id, displayName, tagline, description, setupUrl, docsUrl, supportedModels, defaultModel, credentialType }
));

const getSetupInfo = (providerId) => {
  const config = providersConfig[providerId];
  if (!config) throw new NotFoundError(`Unknown provider "${providerId}"`);
  const { id, setupUrl, docsUrl, setupInstructions, supportedModels, defaultModel } = config;
  return { provider: id, setupUrl, docsUrl, steps: setupInstructions, supportedModels, defaultModel };
};

const listConnected = async (userId) => repository.listForUser(userId);

// Test-drives a key against the live provider WITHOUT persisting anything —
// used both by the "Test & Connect" flow before saving and by the
// standalone /validate endpoint.
const validateCredential = async (providerId, apiKey, model) => {
  const adapter = adapters[providerId];
  if (!adapter) throw new BadRequestError(`Unknown provider "${providerId}"`);
  if (!apiKey) throw new BadRequestError('apiKey is required');
  try {
    return await adapter.validate(apiKey, model);
  } catch (err) {
    if (err instanceof AIProviderError) throw err;
    throw new AIProviderError('UNKNOWN_PROVIDER_ERROR', err.message, { statusCode: 502 });
  }
};

// Validate -> encrypt -> save. The old working key is never overwritten
// until the new one successfully round-trips against the live provider —
// see Section 11 threat model, Project DOCs/BYOK.md.
const connect = async (userId, providerId, apiKey, model) => {
  const config = providersConfig[providerId];
  if (!config) throw new BadRequestError(`Unknown provider "${providerId}"`);
  const resolvedModel = model || config.defaultModel;

  await validateCredential(providerId, apiKey, resolvedModel);

  const encryptedCredential = encryptionService.encrypt(apiKey);
  const priority = await repository.getNextPriority(userId);
  const row = await repository.upsertConnected({
    userId, provider: providerId, encryptedCredential, model: resolvedModel, priority,
  });
  logger.info(`[ai-providers.service] user ${userId} connected provider ${providerId}`);
  return row;
};

const updateModel = async (userId, id, model) => {
  if (!model) throw new BadRequestError('model is required');
  const ok = await repository.updateModel(id, userId, model);
  if (!ok) throw new NotFoundError('Provider not found');
  return repository.getById(id, userId);
};

// Re-tests a stored credential (decrypts server-side, never returns it) and
// updates the row's validated/error state based on the result.
const testStored = async (userId, id) => {
  const row = await repository.getById(id, userId);
  if (!row) throw new NotFoundError('Provider not found');
  const adapter = adapters[row.provider];
  if (!adapter) throw new BadRequestError(`No adapter for provider "${row.provider}"`);

  const apiKey = encryptionService.decrypt(row.encrypted_credential);
  try {
    const result = await adapter.validate(apiKey, row.model);
    await repository.markValidated(id);
    return { valid: true, latencyMs: result.latencyMs, status: 'CONNECTED' };
  } catch (err) {
    const code = err.code || 'UNKNOWN_PROVIDER_ERROR';
    const status = code === 'INVALID_CREDENTIAL' ? 'INVALID' : 'ERROR';
    await repository.markFailed(id, status, code, err.message);
    return { valid: false, status, code, message: err.message };
  }
};

const setPriorities = async (userId, providerIds) => {
  if (!Array.isArray(providerIds) || providerIds.length === 0) {
    throw new BadRequestError('providerIds must be a non-empty array');
  }
  await repository.reorder(userId, providerIds);
  return repository.listForUser(userId);
};

const disconnect = async (userId, id) => {
  const ok = await repository.remove(id, userId);
  if (!ok) throw new NotFoundError('Provider not found');
};

const getMonthlyUsage = async (userId) => {
  const sub = await repository.getSubscription(userId);
  const yearMonth = currentUtcYearMonth();

  const connected = await repository.getConnectedProviders(userId);
  if (connected.length > 0) {
    return { yearMonth, callsUsed: 0, cap: null, source: 'BYOK' };
  }
  if (sub.has_managed_ai) {
    return { yearMonth, callsUsed: 0, cap: null, source: 'MANAGED_UNLIMITED' };
  }

  const usage = await repository.getOrCreateMonthlyUsage(userId, yearMonth);
  const cap = sub.monthly_call_cap ?? env.byok.freeMonthlyCap;
  return { yearMonth, callsUsed: usage.calls_used, cap, source: 'MANAGED_FREE' };
};

const getUsageSummary = async (userId, days) => {
  const rows = await repository.getUsageSummary(userId, days);
  const breakdownByProvider = {};
  let totalRequests = 0;
  let successCount = 0;
  for (const row of rows) {
    breakdownByProvider[row.provider] = {
      source: row.source,
      total: Number(row.total),
      successCount: Number(row.successCount),
    };
    totalRequests += Number(row.total);
    successCount += Number(row.successCount);
  }
  return { totalRequests, successCount, failureCount: totalRequests - successCount, breakdownByProvider };
};

module.exports = {
  getCatalog,
  getSetupInfo,
  listConnected,
  validateCredential,
  connect,
  updateModel,
  testStored,
  setPriorities,
  disconnect,
  getMonthlyUsage,
  getUsageSummary,
};
