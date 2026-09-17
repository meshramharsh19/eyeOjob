// Thresholds for how sync recency gets described in the UI (see
// SyncStatusCard.jsx) — kept as named constants here rather than hardcoded
// across components, so tuning them later is a one-line change.
export const FRESHNESS_THRESHOLDS = {
  recentMinutes: 15, // "Synced just now" / "Synced N minutes ago"
  staleHours: 24, // beyond this, call it out as possibly outdated
};

// Returns a short, human string describing how long ago `lastSyncedAt` was,
// or null if there's no timestamp to describe yet.
export const describeSyncFreshness = (lastSyncedAt) => {
  if (!lastSyncedAt) return null;

  const diffMs = Date.now() - new Date(lastSyncedAt).getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < FRESHNESS_THRESHOLDS.recentMinutes) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  if (diffHours < FRESHNESS_THRESHOLDS.staleHours) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};

// Whether the last successful sync is old enough to call the data possibly
// outdated, independent of the current sync status (a status of 'success'
// doesn't mean the data is *fresh* — see SyncStatusCard.jsx).
export const isSyncStale = (lastSyncedAt) => {
  if (!lastSyncedAt) return true;
  const diffHours = (Date.now() - new Date(lastSyncedAt).getTime()) / (60 * 60 * 1000);
  return diffHours >= FRESHNESS_THRESHOLDS.staleHours;
};
