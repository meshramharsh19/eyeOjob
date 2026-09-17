const cron = require('node-cron');
const logger = require('../../../config/logger');
const env = require('../../../config/env');
const syncStatusConfig = require('../../../config/syncStatus');
const { syncUserEmails } = require('../pipeline.orchestrator');
const repository = require('../pipeline.repository');

// Continuous worker pool — same pattern as the per-email concurrency inside
// syncUserEmails() (see pipeline.orchestrator.js CONCURRENCY/nextIndex),
// applied one level up (users instead of emails). This is deliberately NOT
// batches of `concurrency` users waiting for each other: a shared cursor
// means the instant one user's sync finishes, that same worker slot picks
// up the next eligible user — never idle while eligible users remain.
//
// Per-user isolation already comes for free from what's below it, not from
// anything here:
//  - startSync()'s atomic UPDATE...WHERE (pipeline.repository.js) is the
//    only thing that decides whether a sync actually runs — duplicate
//    protection and multi-instance safety live there, not in this pool.
//  - syncUserEmails() catches and persists its own failure per user, so one
//    user throwing never stops the pool from moving on to the rest.
const runWorkerPool = async (userIds, concurrency, runOne) => {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < userIds.length) {
      const userId = userIds[nextIndex++];
      try {
        await runOne(userId);
      } catch (err) {
        // syncUserEmails already logs/persists the real failure reason
        // internally; this catch exists only so one user's rejection can
        // never abort the pool for the users after it.
        logger.error(`[scheduler] user ${userId} sync failed:`, err.message);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, userIds.length) }, worker));
};

const runScheduledSync = async () => {
  logger.info('Running scheduled email sync...');
  try {
    const userIds = await repository.getSchedulerEligibleUserIds(syncStatusConfig.staleSyncTimeoutMinutes);
    logger.info(`[scheduler] ${userIds.length} user(s) eligible for automatic sync (concurrency=${env.scheduler.concurrency})`);

    await runWorkerPool(userIds, env.scheduler.concurrency, async (userId) => {
      const result = await syncUserEmails(userId);
      logger.info(`User ${userId}: ${result.jobsFound} new jobs found`);
    });
  } catch (err) {
    logger.error('Scheduler error:', err.message);
  }
};

const startScheduler = () => {
  // Every 30 minutes — sync all eligible connected users, via a continuous
  // worker pool (see runWorkerPool above), not a sequential loop.
  cron.schedule('*/30 * * * *', runScheduledSync);

  logger.info(`Email sync scheduler started (every 30 min, concurrency=${env.scheduler.concurrency})`);
};

module.exports = { startScheduler, runScheduledSync, runWorkerPool };
