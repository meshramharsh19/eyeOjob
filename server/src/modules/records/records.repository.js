const db = require('../../config/database');
const { staleSyncTimeoutMinutes } = require('../../config/syncStatus');

// Read-only, per-user-scoped queries backing the /records API. `applications`
// already has its own full read/write API under /jobs — this module covers
// the remaining tables that had no external API surface yet: processed_emails,
// sync_status, timeline_events, role_aliases, and a trimmed users/me.
//
// Pagination: simple limit/offset, capped, applied consistently across list
// queries so no endpoint can be used to pull an unbounded table dump.
const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

const clampLimit = (limit) => Math.min(Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
const clampOffset = (offset) => Math.max(parseInt(offset, 10) || 0, 0);

// ── processed_emails ────────────────────────────
// plain_text/raw_html are mediumtext (full email bodies) — left out of the
// list view to keep it light, included on the single-record fetch.
const findProcessedEmails = async (userId, { limit, offset } = {}) => {
  const [rows] = await db.query(
    `SELECT id, gmail_msg_id, gmail_thread_id, subject, sender, sender_domain,
            received_at, is_job_related, classification, confidence,
            application_id, raw_snippet, created_at
     FROM processed_emails
     WHERE user_id = ?
     ORDER BY received_at DESC
     LIMIT ? OFFSET ?`,
    [userId, clampLimit(limit), clampOffset(offset)]
  );
  return rows;
};

const findProcessedEmailById = async (id, userId) => {
  const [rows] = await db.query(
    'SELECT * FROM processed_emails WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  return rows[0] || null;
};

// ── sync_status ─────────────────────────────────
// One row per user — no pagination needed.
//
// A `status = 'syncing'` row can be stuck rather than genuinely in progress
// (server crashed mid-sync — see pipeline.repository.js startSync() for the
// write-side reclaim using the same staleSyncTimeoutMinutes). Rather than a
// separate cron job to fix these up, the read here just presents a
// stuck row as 'failed' with a SYNC_TIMEOUT code — the underlying row is
// left untouched until the next real sync attempt claims and overwrites it.
const findSyncStatus = async (userId) => {
  const [rows] = await db.query(
    `SELECT
       user_id, last_sync_at, last_history_id, total_synced,
       last_sync_started_at, last_sync_finished_at, updated_at,
       CASE
         WHEN status = 'syncing' AND last_sync_started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
         THEN 'failed' ELSE status
       END AS status,
       CASE
         WHEN status = 'syncing' AND last_sync_started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
         THEN 'SYNC_TIMEOUT' ELSE last_error_code
       END AS last_error_code,
       CASE
         WHEN status = 'syncing' AND last_sync_started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)
         THEN 'The last sync did not finish. Please retry.' ELSE last_error_message
       END AS last_error_message
     FROM sync_status WHERE user_id = ?`,
    [staleSyncTimeoutMinutes, staleSyncTimeoutMinutes, staleSyncTimeoutMinutes, userId]
  );
  return rows[0] || null;
};

// ── timeline_events ─────────────────────────────
// No user_id column on this table — scoped via a join through applications.
const findTimelineEvents = async (userId, { limit, offset } = {}) => {
  const [rows] = await db.query(
    `SELECT te.*
     FROM timeline_events te
     JOIN applications a ON a.id = te.application_id
     WHERE a.user_id = ?
     ORDER BY te.event_date DESC
     LIMIT ? OFFSET ?`,
    [userId, clampLimit(limit), clampOffset(offset)]
  );
  return rows;
};

const findTimelineEventById = async (id, userId) => {
  const [rows] = await db.query(
    `SELECT te.*
     FROM timeline_events te
     JOIN applications a ON a.id = te.application_id
     WHERE te.id = ? AND a.user_id = ?`,
    [id, userId]
  );
  return rows[0] || null;
};

// ── role_aliases ────────────────────────────────
// Global lookup table (raw_title -> canonical_title), not per-user data.
const findRoleAliases = async ({ limit, offset } = {}) => {
  const [rows] = await db.query(
    'SELECT * FROM role_aliases ORDER BY raw_title ASC LIMIT ? OFFSET ?',
    [clampLimit(limit), clampOffset(offset)]
  );
  return rows;
};

// ── users ───────────────────────────────────────
// Self-only, and never the password hash or any OAuth token column.
const findSelf = async (userId) => {
  const [rows] = await db.query(
    `SELECT id, email, name, is_verified, avatar, gmail_connected, created_at
     FROM users WHERE id = ?`,
    [userId]
  );
  return rows[0] || null;
};

module.exports = {
  findProcessedEmails,
  findProcessedEmailById,
  findSyncStatus,
  findTimelineEvents,
  findTimelineEventById,
  findRoleAliases,
  findSelf,
};
