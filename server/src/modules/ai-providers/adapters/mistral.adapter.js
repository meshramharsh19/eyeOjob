const BaseAIProvider = require('./base.adapter');
const { cleanAndParse } = require('../../../pipelines/email-pipeline/extraction/prompt.builder');
const providersConfig = require('../config/providers.config');

const usageFromOpenAIStyle = (data) => data.usage
  ? { promptTokens: data.usage.prompt_tokens ?? null, completionTokens: data.usage.completion_tokens ?? null, totalTokens: data.usage.total_tokens ?? null }
  : null;

class MistralAdapter extends BaseAIProvider {
  constructor() {
    super(providersConfig.mistral);
  }

  async _call(apiKey, model, prompt) {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) {
      const err = new Error(`Mistral request failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    return {
      json: cleanAndParse(data.choices?.[0]?.message?.content?.trim() || ''),
      usage: usageFromOpenAIStyle(data),
    };
  }
}

module.exports = new MistralAdapter();
