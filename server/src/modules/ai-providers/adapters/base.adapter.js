// Abstract contract every BYOK adapter implements — reused by aiGateway's
// BYOK chain. Shares the exact prompt/response parsing used by the server
// chain (extraction/prompt.builder.js) so extraction behavior is identical
// regardless of whose API key runs it.
const { buildPrompt } = require('../../../pipelines/email-pipeline/extraction/prompt.builder');
const { classifyHttpStatus, AIProviderError } = require('../errors/ai.errors');

const HEALTH_CHECK_PROMPT = 'Return ONLY this exact JSON, nothing else: {"ok":true}';

class BaseAIProvider {
  constructor(config) {
    this.providerId = config.id;
    this.displayName = config.displayName;
    this.defaultModel = config.defaultModel;
  }

  // Subclasses implement this: given an already-built prompt, call the
  // provider's chat/completions endpoint and return { json, usage }.
  // Must throw a raw Error/fetch-response-derived error on failure —
  // normalizeError() below converts it to AIProviderError uniformly.
  async _call(_apiKey, _model, _prompt) {
    throw new Error(`${this.providerId} adapter must implement _call()`);
  }

  async extract(apiKey, model, subject, body, sender, emailReceivedAt = null, fewShotExamples = []) {
    const prompt = buildPrompt(subject, body, sender, emailReceivedAt, fewShotExamples);
    try {
      return await this._call(apiKey, model || this.defaultModel, prompt);
    } catch (err) {
      throw this.normalizeError(err);
    }
  }

  async validate(apiKey, model) {
    const start = Date.now();
    try {
      await this._call(apiKey, model || this.defaultModel, HEALTH_CHECK_PROMPT);
      return { valid: true, latencyMs: Date.now() - start };
    } catch (err) {
      throw this.normalizeError(err);
    }
  }

  // Default normalization assumes the adapter throws either a plain Error
  // with a `.status` (from a fetch Response) or an SDK error exposing
  // `.status`/`.response.status`. Adapters with a different error shape
  // (e.g. Gemini's SDK) override this.
  normalizeError(error) {
    const status = error?.status || error?.response?.status;
    const { code, retryable } = classifyHttpStatus(status);
    return new AIProviderError(code, error?.message || `${this.providerId} request failed`, {
      retryable,
      statusCode: status && status < 500 ? status : 502,
    });
  }
}

module.exports = BaseAIProvider;
