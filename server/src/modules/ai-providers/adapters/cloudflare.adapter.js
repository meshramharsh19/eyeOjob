const BaseAIProvider = require('./base.adapter');
const { cleanAndParse } = require('../../../pipelines/email-pipeline/extraction/prompt.builder');
const providersConfig = require('../config/providers.config');

const usageFromOpenAIStyle = (data) => data.usage
  ? { promptTokens: data.usage.prompt_tokens ?? null, completionTokens: data.usage.completion_tokens ?? null, totalTokens: data.usage.total_tokens ?? null }
  : null;

// The one BYOK provider needing two secrets (account ID + API token) where
// every other adapter here needs one — user_ai_providers.encrypted_credential
// only has room for a single field, so both are packed into it as
// "accountId:apiToken" at connect time (see providers.config.js's
// setupInstructions) and split back apart here, right before the call.
class CloudflareAdapter extends BaseAIProvider {
  constructor() {
    super(providersConfig.cloudflare);
  }

  async _call(apiKey, model, prompt) {
    const separatorIndex = apiKey.indexOf(':');
    if (separatorIndex === -1) {
      const err = new Error('Cloudflare key must be in the form accountId:apiToken');
      err.status = 400;
      throw err;
    }
    const accountId = apiKey.slice(0, separatorIndex);
    const apiToken = apiKey.slice(separatorIndex + 1);

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      }
    );
    if (!res.ok) {
      const err = new Error(`Cloudflare request failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    if (!data.success) {
      const err = new Error(`Cloudflare error: ${JSON.stringify(data.errors)}`);
      err.status = 401; // Cloudflare reports bad account_id/token as success:false, not a 4xx status
      throw err;
    }
    // llama-3.1-8b-instruct responds in OpenAI chat-completion shape wrapped
    // one level deeper — { result: { choices: [...] } } — other Workers AI
    // models may use { result: { response: "..." } } instead.
    const content = data.result?.choices?.[0]?.message?.content ?? data.result?.response;
    return {
      json: cleanAndParse((content || '').trim()),
      usage: usageFromOpenAIStyle(data.result || {}),
    };
  }
}

module.exports = new CloudflareAdapter();
