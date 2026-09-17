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
    openRouterModel: process.env.OPENROUTER_MODEL || 'google/gemma-4-31b-it:free',
    cerebrasApiKey: process.env.CEREBRAS_API_KEY,
    cerebrasModel: process.env.CEREBRAS_MODEL || 'gpt-oss-120b',
    mistralApiKey: process.env.MISTRAL_API_KEY,
    mistralModel: process.env.MISTRAL_MODEL || 'mistral-small-latest',
    sambanovaApiKey: process.env.SAMBANOVA_API_KEY,
    sambanovaModel: process.env.SAMBANOVA_MODEL || 'Meta-Llama-3.3-70B-Instruct',
    cloudflareAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    cloudflareApiToken: process.env.CLOUDFLARE_API_TOKEN,
    cloudflareModel: process.env.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct',
    cohereApiKey: process.env.COHERE_API_KEY,
    cohereModel: process.env.COHERE_MODEL || 'command-r-08-2024',
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
