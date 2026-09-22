const Groq = require('groq-sdk');
const BaseAIProvider = require('./base.adapter');
const { cleanAndParse } = require('../../../pipelines/email-pipeline/extraction/prompt.builder');
const providersConfig = require('../config/providers.config');

const usageFromOpenAIStyle = (data) => data.usage
  ? { promptTokens: data.usage.prompt_tokens ?? null, completionTokens: data.usage.completion_tokens ?? null, totalTokens: data.usage.total_tokens ?? null }
  : null;

class GroqAdapter extends BaseAIProvider {
  constructor() {
    super(providersConfig.groq);
  }

  async _call(apiKey, model, prompt) {
    const client = new Groq({ apiKey });
    const completion = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });
    return {
      json: cleanAndParse(completion.choices[0]?.message?.content?.trim() || ''),
      usage: usageFromOpenAIStyle(completion),
    };
  }
  // groq-sdk throws errors exposing `.status` directly — base.normalizeError
  // already reads that, so no override needed.
}

module.exports = new GroqAdapter();
