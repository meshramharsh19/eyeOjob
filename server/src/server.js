const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const { startScheduler } = require('./pipelines/email-pipeline');
const { checkProviderHealth } = require('./pipelines/email-pipeline/extraction/ai.extractor');

startScheduler();

// Fire-and-forget: don't block server startup on provider pings, but log
// results as soon as they're in so config problems are visible immediately.
checkProviderHealth().catch((err) => logger.error('[server] provider health check failed:', err.message));

app.listen(env.port, () => logger.info(`Server on http://localhost:${env.port}`));
