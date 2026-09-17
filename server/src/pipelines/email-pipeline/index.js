const { routes } = require('./connection');
const { startScheduler } = require('./ingestion/scheduler');
const { syncUserEmails, requestStop } = require('./pipeline.orchestrator');
const { forceStopStuckSync } = require('./pipeline.repository');

module.exports = {
  routes,        // Gmail connect/callback/status — mounted at /gmail
  startScheduler,
  syncUserEmails,
  requestStop,
  forceStopStuckSync,
};
