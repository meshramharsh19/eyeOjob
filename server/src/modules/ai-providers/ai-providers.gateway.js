const logger = require('../../config/logger');
const env = require('../../config/env');
const repository = require('./ai-providers.repository');
const adapters = require('./adapters');
const encryptionService = require('./security/encryption.service');
const { QuotaExceededError } = require('./errors/ai.errors');
const { extractJobDetails } = require('../../pipelines/email-pipeline/extraction/ai.extractor');
const notificationsService = require('../notifications/notifications.service');

// UTC, decided once — see Decision Log #4, Project DOCs/BYOK.md. Avoids
// ambiguous month-rollover behavior for users in different timezones.
const currentUtcYearMonth = () => new Date().toISOString().slice(0, 7); // 'YYYY-MM'

// Per-BYOK-provider call timeout — mirrors the server chain's
// PROVIDER_TIMEOUT_MS in ai.extractor.js. A single user's chain is short
// (typically 1-3 providers), so this doesn't need the server chain's full
// circuit-breaker machinery; a stalled key just gets skipped this call.
const BYOK_PROVIDER_TIMEOUT_MS = 12000;

const withTimeout = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// Section 3.2, Project DOCs/BYOK.md — the core new decision point. Decides
// which fallback chain a given user's AI calls run against for this sync.
const resolveChain = async (userId) => {
  const userProviders = await repository.getConnectedProviders(userId);
  if (userProviders.length > 0) {
    return { source: 'BYOK', userProviders };
  }

  const sub = await repository.getSubscription(userId);
  if (sub.has_managed_ai) {
    return { source: 'MANAGED_UNLIMITED' };
  }

  const yearMonth = currentUtcYearMonth();
  const usage = await repository.getOrCreateMonthlyUsage(userId, yearMonth);
  const cap = sub.monthly_call_cap ?? env.byok.freeMonthlyCap;
  if (usage.calls_used >= cap) {
    throw new QuotaExceededError({ userId, cap, used: usage.calls_used });
  }

  return { source: 'MANAGED_FREE', yearMonth, cap };
};

// Section 5.3 — BYOK never silently falls back to server keys. Tries each
// connected provider in priority order; if all fail, throws so the caller
// tags the email extraction_failed and (at the sync level) can notify the
// user their connected keys are failing.
const runByokChain = async (userId, userProviders, subject, body, sender, emailReceivedAt, fewShotExamples) => {
  let lastErr;
  for (const row of userProviders) {
    const adapter = adapters[row.provider];
    if (!adapter) {
      logger.warn(`[ai-providers.gateway] user ${userId} has connected provider "${row.provider}" with no matching adapter — skipping`);
      continue;
    }
    const start = Date.now();
    try {
      const credential = encryptionService.decrypt(row.encrypted_credential);
      const { json, usage } = await withTimeout(
        adapter.extract(credential, row.model, subject, body, sender, emailReceivedAt, fewShotExamples),
        BYOK_PROVIDER_TIMEOUT_MS,
        row.provider
      );
      const latencyMs = Date.now() - start;
      await repository.markUsed(row.id);
      await repository.logUsage({
        userId, provider: row.provider, model: row.model, source: 'BYOK',
        latencyMs, success: true,
        promptTokens: usage?.promptTokens, completionTokens: usage?.completionTokens, totalTokens: usage?.totalTokens,
      });
      return json;
    } catch (err) {
      const latencyMs = Date.now() - start;
      lastErr = err;
      const errorCode = err.code || 'UNKNOWN_PROVIDER_ERROR';
      logger.error(`[ai-providers.gateway] BYOK provider ${row.provider} failed for user ${userId} — ${err.message}`);
      await repository.logUsage({
        userId, provider: row.provider, model: row.model, source: 'BYOK',
        latencyMs, success: false, errorCategory: errorCode,
      });
      // Permanent failures (bad key, unsupported model) mark the row so the
      // settings UI surfaces it; transient ones (rate limit, provider down)
      // are left CONNECTED — the same key may well succeed on the next sync.
      if (err.retryable === false) {
        await repository.markFailed(row.id, errorCode === 'INVALID_CREDENTIAL' ? 'INVALID' : 'ERROR', errorCode, err.message);
      }
    }
  }
  throw lastErr || new Error('All connected BYOK providers failed');
};

// Entry point used by pipeline.orchestrator.js in place of a direct
// extractJobDetails() call. userId drives BYOK vs managed-tier resolution;
// everything else matches extractJobDetails's existing signature.
// fewShotExamples: AI Correction Feedback Loop (Project DOCs/
// ai-feedback-loop.md §5.2) — pre-fetched, bounded correction examples for
// this sender; optional, defaults to none so every existing caller
// (including tests) keeps working unchanged.
const extract = async (userId, subject, body, sender, stats, emailReceivedAt, fewShotExamples = []) => {
  const resolution = await resolveChain(userId);

  if (resolution.source === 'BYOK') {
    return runByokChain(userId, resolution.userProviders, subject, body, sender, emailReceivedAt, fewShotExamples);
  }

  // MANAGED_FREE / MANAGED_UNLIMITED — reuse the existing, proven server
  // fallback chain (circuit breaker, per-provider rate-limit retry, etc)
  // unchanged. Quota is incremented only for MANAGED_FREE, after a
  // successful call, matching Section 5.4's atomic per-call accounting.
  //
  // stats.aiProviderStats is a *cumulative* per-sync counter (see
  // pipeline.stats.js recordProviderCall) — snapshotting it before/after
  // this single call and diffing lets ai_usage_logs attribute this specific
  // extraction to whichever provider(s) the server chain actually tried,
  // without needing extractJobDetails to change its return shape. This is
  // what makes Section 13's cost-visibility mitigation ("monitor
  // ai_usage_logs.source breakdown") actually work for the managed tier —
  // without it, only BYOK calls would ever appear in ai_usage_logs.
  const before = stats
    ? Object.fromEntries(Object.entries(stats.aiProviderStats).map(([k, v]) => [k, { ...v }]))
    : {};

  const result = await extractJobDetails(subject, body, sender, stats, emailReceivedAt, fewShotExamples);

  if (stats) {
    for (const [providerName, after] of Object.entries(stats.aiProviderStats)) {
      const prior = before[providerName] || { calls: 0, ms: 0, failures: 0 };
      const deltaCalls = after.calls - prior.calls;
      if (deltaCalls <= 0) continue; // not touched by this particular extraction call
      const deltaFailures = after.failures - prior.failures;
      const deltaMs = after.ms - prior.ms;
      await repository.logUsage({
        userId, provider: providerName.toLowerCase(), model: 'unknown', source: resolution.source,
        latencyMs: deltaMs, success: deltaFailures < deltaCalls,
        errorCategory: deltaFailures >= deltaCalls ? 'UNKNOWN_PROVIDER_ERROR' : null,
      });
    }
  }

  if (resolution.source === 'MANAGED_FREE' && !result.extractionFailed) {
    await repository.incrementMonthlyUsage(userId, resolution.yearMonth);
  }

  return result;
};

// Called from pipeline.orchestrator.js's sync-level catch for
// QuotaExceededError. Fires notifyQuotaExceeded at most once per user per
// month — see quota_notified on user_ai_monthly_usage — regardless of how
// many blocked sync attempts (manual retries, stale scheduler ticks before
// its exclusion takes effect) happen after the cap is first hit.
const notifyQuotaOnce = async (userId, yearMonth) => {
  const usage = await repository.getOrCreateMonthlyUsage(userId, yearMonth);
  if (usage.quota_notified) return;
  await notificationsService.notifyQuotaExceeded({ userId });
  await repository.markQuotaNotified(userId, yearMonth);
};

module.exports = { resolveChain, extract, currentUtcYearMonth, notifyQuotaOnce };
