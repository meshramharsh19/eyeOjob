const { AppError } = require('../../../errors');

// Normalized AI error taxonomy — see Section 9, Project DOCs/BYOK.md.
// Adapters throw AIProviderError with one of these `code`s; the gateway
// decides retry/chain-advance/status-update behavior purely off `code` and
// `retryable`, never off provider-specific error shapes.
class AIProviderError extends AppError {
  constructor(code, message, { retryable = false, statusCode = 502 } = {}) {
    super(message, statusCode);
    this.code = code;
    this.retryable = retryable;
  }
}

// Thrown by aiGateway.resolveChain() before any provider is even called —
// not a provider error, an application-level state (free quota exhausted,
// no BYOK key, no paid plan).
class QuotaExceededError extends AppError {
  constructor({ userId, cap, used } = {}) {
    super('Monthly free AI quota exceeded', 402);
    this.code = 'QUOTA_EXCEEDED';
    this.userId = userId;
    this.cap = cap;
    this.used = used;
  }
}

// Maps a raw HTTP status (from fetch/SDK) to our normalized code + whether
// it's worth retrying the same provider before moving to the next one in
// the chain. Adapters call this from their normalizeError().
const classifyHttpStatus = (status) => {
  if (status === 401) return { code: 'INVALID_CREDENTIAL', retryable: false };
  if (status === 403) return { code: 'AUTHORIZATION_FAILED', retryable: false };
  if (status === 429) return { code: 'RATE_LIMITED', retryable: true };
  if (status === 402) return { code: 'QUOTA_EXCEEDED', retryable: false };
  if (status === 400 || status === 404) return { code: 'UNSUPPORTED_MODEL', retryable: false };
  if (status >= 500) return { code: 'PROVIDER_UNAVAILABLE', retryable: true };
  return { code: 'UNKNOWN_PROVIDER_ERROR', retryable: false };
};

module.exports = { AIProviderError, QuotaExceededError, classifyHttpStatus };
