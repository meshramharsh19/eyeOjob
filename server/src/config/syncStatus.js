// How long a sync is allowed to sit in `status = 'syncing'` before it's
// treated as stuck (e.g. the server crashed mid-sync) and becomes eligible
// to be reclaimed by the next attempt / shown as failed on read. Same value
// used on both sides — see pipeline.repository.js startSync() (reclaim) and
// records.repository.js findSyncStatus() (display) — so they never disagree
// about what counts as stale.

const parseIntEnv = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

module.exports = {
  staleSyncTimeoutMinutes: parseIntEnv(process.env.SYNC_STUCK_TIMEOUT_MINUTES, 15),
};
