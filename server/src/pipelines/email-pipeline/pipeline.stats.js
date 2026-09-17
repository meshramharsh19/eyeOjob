// ──────────────────────────────────────────────────
// SYNC INSTRUMENTATION
// Measures where time actually goes during a sync — Gmail fetch, rule
// classification, ATS parsing, AI extraction (per-provider), thread
// matching, DB writes — so optimization decisions are based on real
// numbers instead of guesses.
// ──────────────────────────────────────────────────

const createSyncStats = () => ({
  messageCount: 0,
  aiCallCount: 0,
  parserHitCount: 0, // resolved via deterministic parser, no AI call needed
  vendorKnownCount: 0, // sender domain matched a registry entry (parser or not)
  vendorHasParserCount: 0, // ...and that vendor has hasParser: true
  parserAttemptedCount: 0, // parser actually ran
  parserSanityFailCount: 0, // parser ran but result failed the sanity check
  extractionFailedCount: 0, // every AI provider failed/timed out for this email
  vendorBreakdown: {}, // { 'LinkedIn (parser)': n, 'SomeATS (no parser)': n, ... }
  dropStage: {}, // { rule_gate: n, ai_reject: n, extraction_failed: n, error: n, ... } — where messages stopped short of an application row
  gmailFetchMs: 0,
  dbLookupMs: 0,
  ruleClassifyMs: 0,
  atsParseMs: 0,
  aiExtractMs: 0,
  aiProviderStats: {}, // { Groq: { calls, ms, failures }, OpenRouter: {...}, Gemini: {...} }
  normalizeMs: 0,
  matchMs: 0,
  dbWriteMs: 0,
  totalMs: 0,
});

// Wraps a (possibly async) fn, adds its elapsed ms onto stats[key].
const timeIt = async (stats, key, fn) => {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    stats[key] = (stats[key] || 0) + (Date.now() - start);
  }
};

const recordProviderCall = (stats, providerName, ms, failed) => {
  const entry = stats.aiProviderStats[providerName] || { calls: 0, ms: 0, failures: 0 };
  entry.calls++;
  entry.ms += ms;
  if (failed) entry.failures++;
  stats.aiProviderStats[providerName] = entry;
};

// Every place processEmail bails out (`return null`) before producing an
// application row should call this with a short stage tag, so a sync's
// summary answers "where are messages actually being lost" directly instead
// of that having to be reverse-engineered from logs after the fact.
const recordDrop = (stats, stage) => {
  stats.dropStage[stage] = (stats.dropStage[stage] || 0) + 1;
};

// Human-readable summary for console + API response.
const summarizeStats = (stats) => ({
  messageCount: stats.messageCount,
  aiCallCount: stats.aiCallCount,
  parserHitCount: stats.parserHitCount,
  vendorKnownCount: stats.vendorKnownCount,
  vendorHasParserCount: stats.vendorHasParserCount,
  parserAttemptedCount: stats.parserAttemptedCount,
  parserSanityFailCount: stats.parserSanityFailCount,
  extractionFailedCount: stats.extractionFailedCount,
  vendorBreakdown: stats.vendorBreakdown,
  dropStage: stats.dropStage,
  totalMs: stats.totalMs,
  breakdownMs: {
    gmailFetch: stats.gmailFetchMs,
    dbLookup: stats.dbLookupMs,
    ruleClassify: stats.ruleClassifyMs,
    atsParse: stats.atsParseMs,
    aiExtract: stats.aiExtractMs,
    normalize: stats.normalizeMs,
    match: stats.matchMs,
    dbWrite: stats.dbWriteMs,
  },
  aiProviderStats: stats.aiProviderStats,
});

module.exports = { createSyncStats, timeIt, recordProviderCall, recordDrop, summarizeStats };
