const { GoogleGenerativeAI } = require('@google/generative-ai');
const BaseAIProvider = require('./base.adapter');
const { cleanAndParse } = require('../../../pipelines/email-pipeline/extraction/prompt.builder');
const providersConfig = require('../config/providers.config');
const { classifyHttpStatus, AIProviderError } = require('../errors/ai.errors');

class GeminiAdapter extends BaseAIProvider {
  constructor() {
    super(providersConfig.gemini);
  }

  async _call(apiKey, model, prompt) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const generativeModel = genAI.getGenerativeModel({ model });
    const result = await generativeModel.generateContent(prompt);
    const usageMeta = result.response.usageMetadata;
    return {
      json: cleanAndParse(result.response.text().trim()),
      usage: usageMeta
        ? { promptTokens: usageMeta.promptTokenCount ?? null, completionTokens: usageMeta.candidatesTokenCount ?? null, totalTokens: usageMeta.totalTokenCount ?? null }
        : null,
    };
  }

  // The Gemini SDK doesn't expose a plain `.status` — it embeds it in the
  // error message (e.g. "[400 Bad Request] ...") or exposes `.status` on
  // some error subclasses depending on SDK version, so check both.
  normalizeError(error) {
    const status = error?.status || Number(String(error?.message || '').match(/\[(\d{3})/)?.[1]);
    const { code, retryable } = classifyHttpStatus(status);
    return new AIProviderError(code, error?.message || 'Gemini request failed', {
      retryable,
      statusCode: status && status < 500 ? status : 502,
    });
  }
}

module.exports = new GeminiAdapter();
