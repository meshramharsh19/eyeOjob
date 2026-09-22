const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const env = require('../../../config/env');
const logger = require('../../../config/logger');
const { INTENTS, isLifecycleIntent } = require('../classification/intentTypes');
const { recordProviderCall } = require('../pipeline.stats');
const { buildPrompt, cleanAndParse } = require('./prompt.builder');

const groq = new Groq({ apiKey: env.ai.groqApiKey });
const genAI = new GoogleGenerativeAI(env.ai.geminiApiKey);

const OPENROUTER_API_KEY = env.ai.openRouterApiKey;
const OPENROUTER_MODEL = env.ai.openRouterModel;

// ──────────────────────────────────────────────
// Provider callers — each throws on failure, and each returns
// { json, usage } rather than the bare parsed object, so the caller can log
// token consumption per provider. `usage` is null where a provider doesn't
// expose it (shouldn't happen for any of these OpenAI-compatible ones, but
// Gemini reports it under a different field name, handled below).
// ──────────────────────────────────────────────
const usageFromOpenAIStyle = (data) => data.usage
  ? { promptTokens: data.usage.prompt_tokens ?? null, completionTokens: data.usage.completion_tokens ?? null, totalTokens: data.usage.total_tokens ?? null }
  : null;

const callGroq = async (prompt) => {
  const completion = await groq.chat.completions.create({
    model: env.ai.groqModel,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' }
  });
  return {
    json: cleanAndParse(completion.choices[0]?.message?.content?.trim() || ''),
    usage: usageFromOpenAIStyle(completion),
  };
};

const callOpenRouter = async (prompt) => {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error(`OpenRouter request failed: ${res.status}`);
  const data = await res.json();
  return {
    json: cleanAndParse(data.choices?.[0]?.message?.content?.trim() || ''),
    usage: usageFromOpenAIStyle(data),
  };
};

// Was 'gemini-2.5-flash-lite' — that pinned model is deprecated for new
// users and 404s now. 'gemini-flash-lite-latest' is Google's rolling alias
// to whatever their current fast/free-tier model is, so this stops going
// stale every time Google renames/retires a version.
const callGemini = async (prompt) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' });
  const result = await model.generateContent(prompt);
  const usageMeta = result.response.usageMetadata;
  return {
    json: cleanAndParse(result.response.text().trim()),
    usage: usageMeta
      ? { promptTokens: usageMeta.promptTokenCount ?? null, completionTokens: usageMeta.candidatesTokenCount ?? null, totalTokens: usageMeta.totalTokenCount ?? null }
      : null,
  };
};

// Cloudflare Workers AI — permanent free tier, 10,000 "neurons"/day (their
// compute unit), resets daily, no card. Endpoint is per-account/per-model;
// the llama-3.1-8b-instruct model actually responds in OpenAI chat-completion
// shape wrapped one level deeper — { result: { choices: [...] } }, not the
// { result: { response: "..." } } shape some other Workers AI models use.
// Verified directly against the live API rather than assumed from docs.
const CLOUDFLARE_ACCOUNT_ID = env.ai.cloudflareAccountId;
const CLOUDFLARE_API_TOKEN = env.ai.cloudflareApiToken;
const CLOUDFLARE_MODEL = env.ai.cloudflareModel;

const callCloudflare = async (prompt) => {
  if (!CLOUDFLARE_ACCOUNT_ID || !CLOUDFLARE_API_TOKEN) throw new Error('CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN not set');
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/run/${CLOUDFLARE_MODEL}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`
      },
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] })
    }
  );
  if (!res.ok) throw new Error(`Cloudflare request failed: ${res.status}`);
  const data = await res.json();
  if (!data.success) throw new Error(`Cloudflare error: ${JSON.stringify(data.errors)}`);
  const content = data.result?.choices?.[0]?.message?.content ?? data.result?.response;
  return {
    json: cleanAndParse((content || '').trim()),
    usage: usageFromOpenAIStyle(data.result || {}),
  };
};

// Cohere — using their OpenAI-compatibility endpoint rather than the native
// /v2/chat shape, so it reuses the same request/response handling as every
// other provider here. Trial key free tier (~100 req/day, doesn't expire),
// smallest daily volume of the new providers so it's placed near the end.
const COHERE_API_KEY = env.ai.cohereApiKey;
const COHERE_MODEL = env.ai.cohereModel;

const callCohere = async (prompt) => {
  if (!COHERE_API_KEY) throw new Error('COHERE_API_KEY not set');
  const res = await fetch('https://api.cohere.ai/compatibility/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${COHERE_API_KEY}`
    },
    body: JSON.stringify({
      model: COHERE_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error(`Cohere request failed: ${res.status}`);
  const data = await res.json();
  return {
    json: cleanAndParse(data.choices?.[0]?.message?.content?.trim() || ''),
    usage: usageFromOpenAIStyle(data),
  };
};

// Hugging Face Inference (router) — free serverless tier, OpenAI-compatible
// endpoint, no card. The router auto-picks a backing inference provider for
// whichever model is requested; if HUGGINGFACE_MODEL 404s, check which
// providers currently serve that model at huggingface.co/models (serverless
// free-tier availability shifts as providers rotate in/out).
const HUGGINGFACE_API_KEY = env.ai.huggingfaceApiKey;
const HUGGINGFACE_MODEL = env.ai.huggingfaceModel;

const callHuggingFace = async (prompt) => {
  if (!HUGGINGFACE_API_KEY) throw new Error('HUGGINGFACE_API_KEY not set');
  const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${HUGGINGFACE_API_KEY}`
    },
    body: JSON.stringify({
      model: HUGGINGFACE_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' }
    })
  });
  if (!res.ok) throw new Error(`Hugging Face request failed: ${res.status}`);
  const data = await res.json();
  return {
    json: cleanAndParse(data.choices?.[0]?.message?.content?.trim() || ''),
    usage: usageFromOpenAIStyle(data),
  };
};

// All provider callers, keyed by name — used by both the fallback chain and
// the startup health check below, so there's one source of truth for
// "what providers exist and are they configured".
const PROVIDER_CALLERS = {
  Gemini: { call: callGemini, configured: () => !!env.ai.geminiApiKey },
  Cohere: { call: callCohere, configured: () => !!COHERE_API_KEY },
  OpenRouter: { call: callOpenRouter, configured: () => !!OPENROUTER_API_KEY },
  Cloudflare: { call: callCloudflare, configured: () => !!(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN) },
  HuggingFace: { call: callHuggingFace, configured: () => !!HUGGINGFACE_API_KEY },
  Groq: { call: callGroq, configured: () => true }, // required env var, checked at process start
};

// ──────────────────────────────────────────────
// AI EMAIL EXTRACTOR
// Company, role, platform, status extract karta hai
// Order: Gemini -> Cohere -> OpenRouter -> Cloudflare -> HuggingFace -> Groq
//
// GitHub Models, NVIDIA NIM, Cerebras, SambaNova, and Mistral were all tried
// (2026-09) and removed entirely — not just excluded from the chain — after
// verifying directly against their live APIs that none can work under a
// free/no-card setup: GitHub Models returned a platform-wide
// "retirement_brownout" (the product itself is being sunset), NVIDIA NIM's
// entire free small-model catalog (9 different model IDs tried) 410s as
// "end of life 2026-08-26", Cerebras/SambaNova both 402 requiring a
// payment method regardless of key, and Mistral 429s instantly even on a
// single request with zero load and a freshly rotated key. If any of these
// products change their free-tier terms later, re-add from scratch rather
// than assuming the old integration still matches their current API.
//
// Groq uses 'openai/gpt-oss-20b' — its earlier model
// (llama-3.1-8b-instant) was retired from this key's catalog entirely
// (confirmed via GET /v1/models). Gemini uses 'gemini-flash-lite-latest'
// (Google's rolling alias) rather than a pinned version — the earlier
// pinned model had gone stale/404 for new users.
//
// OpenRouter's free-model availability rotates — verify at
// openrouter.ai/models if OPENROUTER_MODEL starts failing; most free
// slugs there share a congested upstream pool across all OpenRouter users.
// ──────────────────────────────────────────────

// History: 40000ms -> 12000ms -> 18000ms. With 7 providers now chained,
// even 18s per hop is too expensive if several stall in a row (up to 2+
// minutes worst case). 9s is the new target — long enough that a genuinely
// answering provider isn't cut off, short enough that a full 7-provider
// fallback still resolves in well under a minute even if the first few fail.
const PROVIDER_TIMEOUT_MS = 9000;

// A stalled/rate-limited provider must never eat the whole sync budget —
// fail fast and let the next provider in the chain take over.
const withTimeout = (promise, ms, label) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// ── Per-provider concurrency limiter ────────────────────────────────────
// Overall sync concurrency (pipeline.orchestrator.js CONCURRENCY) used to be
// capped at 2 purely to protect Groq's free-tier rate limit — which throttled
// every email in the sync, including ones that never call AI at all. Rate
// limiting belongs at the provider call site, not the whole pipeline: cap how
// many Groq calls are in flight at once here, and let orchestrator concurrency
// reflect actual I/O parallelism instead of Groq's quota.
const makeLimiter = (maxConcurrent) => {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => { active--; next(); });
  };
  return (fn) => new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    next();
  });
};

const groqLimiter = makeLimiter(3);
const huggingfaceLimiter = makeLimiter(2); // Hugging Face's serverless free tier is fairly tight
const PROVIDER_LIMITERS = { Groq: groqLimiter, HuggingFace: huggingfaceLimiter };

// ── Circuit breaker ─────────────────────────────────────────────────────
// With 7 providers in the chain, a provider that's down for an extended
// stretch (quota exhausted for the day, outage, etc.) shouldn't still eat a
// full timeout on every single email — that's pure wasted latency once it's
// established the provider isn't answering. After 3 consecutive failures,
// skip that provider entirely for 10 minutes; a 200 anywhere resets its
// failure count immediately. State is in-memory and per-process, which is
// fine here — it only needs to survive within one sync run, and resetting
// on restart is the safe direction to fail in.
const CIRCUIT_FAILURE_THRESHOLD = 3;
const CIRCUIT_COOLDOWN_MS = 10 * 60 * 1000;
const circuitState = {}; // { [providerName]: { consecutiveFailures, openUntil } }

const getCircuit = (name) => (circuitState[name] ??= { consecutiveFailures: 0, openUntil: 0 });

const isCircuitOpen = (name) => Date.now() < getCircuit(name).openUntil;

const recordCircuitSuccess = (name) => {
  const circuit = getCircuit(name);
  circuit.consecutiveFailures = 0;
  circuit.openUntil = 0;
};

const recordCircuitFailure = (name) => {
  const circuit = getCircuit(name);
  circuit.consecutiveFailures++;
  if (circuit.consecutiveFailures >= CIRCUIT_FAILURE_THRESHOLD && circuit.openUntil < Date.now()) {
    circuit.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    logger.warn(`[ai.extractor] circuit opened for ${name} after ${circuit.consecutiveFailures} consecutive failures — skipping for ${CIRCUIT_COOLDOWN_MS / 60000}min`);
  }
};

// ── Rate-limit-aware retry ──────────────────────
// Free-tier providers under sync concurrency hit 429s constantly — most
// clear within a couple seconds. A single short retry recovers a large
// fraction of what would otherwise be treated as a full provider failure,
// without eating so much time that it defeats the point of the fallback chain.
const isRateLimitError = (err) => {
  const status = err?.status || err?.response?.status;
  if (status === 429) return true;
  return /\b429\b|rate.?limit|quota|resource.*exhausted/i.test(err?.message || '');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const callWithRetry = async (call, prompt, label) => {
  const attempt = () => withTimeout(call(prompt), PROVIDER_TIMEOUT_MS, label);
  // Groq/Cerebras calls are funneled through a per-provider concurrency
  // limiter instead of relying on orchestrator-wide concurrency to stay low —
  // this is what actually protects each free-tier quota now (see
  // makeLimiter above). Providers without a limiter just run directly.
  const limiter = PROVIDER_LIMITERS[label];
  const run = limiter ? () => limiter(attempt) : attempt;
  try {
    return await run();
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    await sleep(1500);
    return run();
  }
};

const extractJobDetails = async (subject, body, sender, stats = null, emailReceivedAt = null) => {
  const prompt = buildPrompt(subject, body, sender, emailReceivedAt);
  // Seven no-card, daily-renewing (not one-time-credit) free tiers, in
  // requested order: Mistral -> Gemini -> Cohere -> Groq -> rest. Cerebras
  // stays out of this chain — it 402s until a card is added — but its call
  // function is kept defined above in case that changes; just splice it
  // back in.
  const providers = [
    ['Gemini', callGemini],
    ['Cohere', callCohere],
    ['OpenRouter', callOpenRouter],
    ['Cloudflare', callCloudflare],
    ['HuggingFace', callHuggingFace],
    ['Groq', callGroq],
  ];

  for (const [name, call] of providers) {
    if (isCircuitOpen(name)) {
      logger.debug(`[ai.extractor] ${name} circuit open, skipping — cooldown until ${new Date(getCircuit(name).openUntil).toISOString()}`);
      continue;
    }

    const start = Date.now();
    try {
      const { json: result, usage } = await callWithRetry(call, prompt, name);
      const ms = Date.now() - start;
      if (stats) recordProviderCall(stats, name, ms, false);
      recordCircuitSuccess(name);
      logger.info(`[ai.extractor] ${name} ok — ${ms}ms, intent=${result.intent || 'null'}, tokens=${usage?.totalTokens ?? 'n/a'}`);

      // Never trust the model's own is_job_email flag over the intent it reported —
      // enforce the lifecycle gate here regardless of what the model claims.
      const lifecycle = isLifecycleIntent(result.intent);
      return {
        ...result,
        intent: result.intent || INTENTS.OTHER,
        is_job_email: lifecycle && result.is_job_email !== false,
        company: lifecycle ? result.company : null,
        role: lifecycle ? result.role : null,
        job_id: lifecycle ? (result.job_id || null) : null,
        location: lifecycle ? (result.location || null) : null,
        event_type: lifecycle ? (result.event_type || null) : null,
        event_date: lifecycle ? (result.event_date || null) : null,
      };
    } catch (err) {
      const ms = Date.now() - start;
      if (stats) recordProviderCall(stats, name, ms, true);
      recordCircuitFailure(name);
      logger.error(`[ai.extractor] ${name} failed — ${ms}ms, reason: ${err.message}`);
    }
  }

  // All providers failed/timed out — this is NOT the same as the AI confidently
  // deciding the email isn't job-related. Flagged distinctly so the caller can
  // route it to needs_review instead of silently discarding a possibly-real
  // application just because every provider happened to be unavailable.
  return {
    intent: INTENTS.OTHER, company: null, role: null, platform: null,
    status: null, event_type: null, event_date: null, applied_date: null,
    job_id: null, location: null,
    confidence: 0, is_job_email: false, extractionFailed: true,
  };
};

// ──────────────────────────────────────────────
// STARTUP HEALTH CHECK
// Pings every configured provider with a trivial prompt so config problems
// (missing key, dead model slug, expired trial) show up in the startup log
// immediately instead of surfacing as a mid-sync failure hours later.
// Call this once from server.js after env is loaded — it's not on the hot
// path of any email sync.
// ──────────────────────────────────────────────
const HEALTH_CHECK_PROMPT = 'Return ONLY this exact JSON, nothing else: {"ok":true}';
const HEALTH_CHECK_TIMEOUT_MS = 6000;

const checkProviderHealth = async () => {
  const names = Object.keys(PROVIDER_CALLERS); // every entry here IS the active chain now — nothing retired-but-kept anymore
  const results = await Promise.all(names.map(async (name) => {
    const provider = PROVIDER_CALLERS[name];
    if (!provider.configured()) {
      return { name, ok: false, reason: 'not configured (missing API key)' };
    }
    try {
      await withTimeout(provider.call(HEALTH_CHECK_PROMPT), HEALTH_CHECK_TIMEOUT_MS, name);
      return { name, ok: true };
    } catch (err) {
      return { name, ok: false, reason: err.message };
    }
  }));

  logger.info('[ai.extractor] provider health check:');
  for (const r of results) {
    logger.info(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.reason}`}`);
  }
  return results;
};

module.exports = { extractJobDetails, checkProviderHealth };
