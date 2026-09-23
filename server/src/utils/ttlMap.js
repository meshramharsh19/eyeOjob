// A small in-memory single-use/expiring store for short-lived handoff
// tokens (OAuth codes, pending-connection state, etc). Backed by a plain
// Map with a periodic sweep so an abandoned flow (tab closed mid-OAuth,
// network drop before the exchange request) doesn't leak forever — a Map
// with only manual on-read deletion never frees entries nobody comes back
// to read.
//
// Caveat: this is process-local. If this server ever runs as more than one
// instance (PM2 cluster, multiple containers behind a load balancer) without
// sticky sessions, a token minted on instance A won't be found on instance
// B. Fine for a single-instance deployment; swap for a shared store (Redis)
// before scaling horizontally.
const createTtlMap = ({ sweepIntervalMs = 60 * 1000 } = {}) => {
  const store = new Map();

  const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.expiresAt) store.delete(key);
    }
  };
  const timer = setInterval(sweep, sweepIntervalMs);
  timer.unref?.(); // never keep the process alive just for this

  const set = (key, value, expiresAt) => {
    store.set(key, { value, expiresAt });
  };

  // Single-use: always deletes on read, valid or not.
  const takeIfValid = (key) => {
    const entry = store.get(key);
    store.delete(key);
    if (!entry || Date.now() > entry.expiresAt) return null;
    return entry.value;
  };

  return { set, takeIfValid };
};

module.exports = { createTtlMap };
