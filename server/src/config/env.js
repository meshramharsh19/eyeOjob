require('dotenv').config();

const REQUIRED_VARS = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_USER',
  'DB_NAME',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
];

const missing = REQUIRED_VARS.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const parsePositiveInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  clientUrl: process.env.CLIENT_URL,

  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES || '7d',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
  },

  ai: {
    groqApiKey: process.env.GROQ_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
    // gemma-4-31b-it:free was hitting OpenRouter's shared upstream-pool 429s
    // constantly (2026-09); deepseek-v4-flash verified working live when
    // most other free-tier models on OpenRouter were also 429ing at the
    // same moment — free slugs/availability rotate, re-check
    // openrouter.ai/models if this one starts failing too.
    openRouterModel: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-v4-flash-0731:free',
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    cloudflareModel: process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct',
    cohereApiKey: process.env.COHERE_API_KEY,
    cohereModel: process.env.COHERE_MODEL || 'command-r-08-2024',
    huggingfaceApiKey: process.env.HUGGINGFACE_API_KEY,
    // Verified working directly against the live router (2026-09) — the
    // earlier Qwen default 400'd as "not supported by any provider you have
    // enabled"; this one returns 200.
    huggingfaceModel: process.env.HUGGINGFACE_MODEL || 'meta-llama/Llama-3.1-8B-Instruct',
    // Cerebras, Mistral, SambaNova, GitHub Models, and NVIDIA NIM were all
    // tried (2026-09) and removed entirely, not just excluded from the
    // chain — none can work under a free/no-card setup (payment-method
    // walls, product retirement, or mass model end-of-life). See
    // ai.extractor.js's chain-order comment for the specifics per provider.
    // llama-3.1-8b-instant was retired from Groq's catalog — verified via
    // GET /v1/models that this key's current catalog no longer has ANY
    // llama-3.x model at all, only openai/gpt-oss-* and a few others.
    // gpt-oss-20b returns 200 and is on Groq's free tier.
    groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
  },

  // BYOK hybrid AI provider architecture — see Project DOCs/BYOK.md.
  byok: {
    // AES-256-GCM master key for encrypting user-supplied provider API keys
    // at rest. Must be exactly 32 bytes (64 hex chars). No AWS KMS/Secrets
    // Manager in this project yet (XAMPP + local/VPS MySQL) — env var is the
    // real target until cloud deployment is actually planned.
    credentialEncryptionKey: process.env.AI_CREDENTIAL_ENCRYPTION_KEY,
    // Monthly AI-call allowance for users on the free tier (no BYOK key, no
    // paid plan). Starting value picked to cover ~90% of genuine job-seeker
    // usage at near-zero server cost — revisit after real ai_usage_logs data.
    freeMonthlyCap: parsePositiveInt(process.env.AI_FREE_MONTHLY_CAP, 150),
  },

  mail: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },

  scheduler: {
    // How many users' syncs the automatic scheduler runs concurrently, as a
    // continuous pool (a finished user is immediately replaced by the next
    // eligible one — not processed in wait-for-everyone batches). Each
    // individual syncUserEmails() call has its own internal per-email
    // concurrency (6, see pipeline.orchestrator.js) — this is a separate,
    // outer knob for how many *users* run at once.
    concurrency: parsePositiveInt(process.env.SCHEDULER_CONCURRENCY, 10),
  },
};
