// Keyed by provider id (matches user_ai_providers.provider and
// providers.config.js keys) — one lookup table for both the BYOK chain
// resolver and the connect/validate/test endpoints.
module.exports = {
  groq: require('./groq.adapter'),
  gemini: require('./gemini.adapter'),
  openrouter: require('./openrouter.adapter'),
  xai: require('./xai.adapter'),
  mistral: require('./mistral.adapter'),
  huggingface: require('./huggingface.adapter'),
  cohere: require('./cohere.adapter'),
  cloudflare: require('./cloudflare.adapter'),
};
