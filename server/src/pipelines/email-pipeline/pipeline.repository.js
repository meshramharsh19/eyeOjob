const db = require('../../config/database');

const findExistingProcessedEmail = async (messageId, userId) => {
  const [rows] = await db.query(
    'SELECT id, is_job_related, classification, application_id FROM processed_emails WHERE gmail_msg_id = ? AND user_id = ?',
    [messageId, userId]
  );
  return rows;
};

const deleteProcessedEmail = async (id) => {
  await db.query('DELETE FROM processed_emails WHERE id = ?', [id]);
};

const insertProcessedEmail = async (fields) => {
  const {
    userId, messageId, threadId, messageIdHeader, references, inReplyTo,
    subject, sender, senderDomain, receivedAt, isJobRelated, classification,
    confidence, snippet, plainText, html,
  } = fields;

  const [result] = await db.query(
    `INSERT INTO processed_emails
     (user_id, gmail_msg_id, gmail_thread_id, message_id_header,
      references_header, in_reply_to, subject, sender, sender_domain,
      received_at, is_job_related, classification, confidence, raw_snippet,
      plain_text, raw_html)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId, messageId, threadId, messageIdHeader,
      references, inReplyTo, subject, sender, senderDomain,
      receivedAt, isJobRelated ? 1 : 0,
      classification, confidence, snippet, plainText, html,
    ]
  );
  return result.insertId;
};

const updateProcessedEmailClassification = async (processedEmailId, classification, confidence) => {
  await db.query(
    'UPDATE processed_emails SET classification = ?, confidence = ? WHERE id = ?',
    [classification, confidence, processedEmailId]
  );
};

const linkEmailToApplication = async (processedEmailId, applicationId) => {
  await db.query(
    'UPDATE processed_emails SET application_id = ? WHERE id = ?',
    [applicationId, processedEmailId]
  );
};

// Only called from pipeline.orchestrator.js after shouldApplyStatus() has already
// confirmed newStatus !== currentStatus, so status_changed_at can be bumped
// unconditionally here without re-checking for an actual change.
const updateApplicationStatus = async (applicationId, status, confidence) => {
  await db.query(
    'UPDATE applications SET status = ?, confidence_score = ?, status_changed_at = NOW(), updated_at = NOW() WHERE id = ?',
    [status, confidence, applicationId]
  );
};

const insertApplication = async (fields) => {
  const {
    userId, company, role, appliedDate, platform, threadId,
    status, confidence, verificationStatus,
    normalizedCompany, normalizedRole, jobId, location,
  } = fields;

  const [result] = await db.query(
    `INSERT INTO applications
     (user_id, company, role, applied_date, platform, source_email_thread_id,
      status, confidence_score, verification_status,
      normalized_company, normalized_role, job_id, location)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId, company, role, appliedDate, platform, threadId,
      status, confidence, verificationStatus,
      normalizedCompany || null, normalizedRole || null, jobId || null, location || null,
    ]
  );
  return result.insertId;
};

// Phase 5: extended to accept emailReceivedAt/confidence/metadata while
// staying backward compatible with every existing caller (manual CRUD in
// applications.repository.js calls its own addTimelineEvent, unaffected).
//
// Idempotency (Phase 3 dedupe rule): INSERT IGNORE relies on the
// uq_email_event_dedupe unique key (email_msg_id, event_type, event_date) —
// see migrations/add_timeline_event_lifecycle_columns.sql. Reprocessing the
// same Gmail message can never create a second row for the same event on
// the same date, but a genuine repeat (e.g. an interview rescheduled to a
// different date, or a follow-up email for the same event_type on the same
// day sent as a distinct message) still gets its own row because at least
// one part of the key differs. Manual milestones (emailMsgId null) never
// collide against each other or against pipeline events via this index,
// since MySQL treats each NULL as distinct within a unique key.
const insertTimelineEvent = async ({
  applicationId, eventType, eventDate, description, emailMsgId,
  matchStrategy, matchConfidence, emailReceivedAt = null, confidence = null,
  metadata = null,
}) => {
  const [result] = await db.query(
    `INSERT IGNORE INTO timeline_events
     (application_id, event_type, event_date, description, email_msg_id, match_strategy, match_confidence,
      email_received_at, confidence, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      applicationId, eventType, eventDate, description, emailMsgId || null,
      matchStrategy || null, matchConfidence ?? null, emailReceivedAt || null,
      confidence ?? null, metadata ? JSON.stringify(metadata) : null,
    ]
  );
  // affectedRows === 0 means the unique key already existed — this exact
  // (email, event_type, event_date) triple was already recorded, so the
  // caller (and any notification it would have fired) should treat this as
  // a genuine duplicate, not a new event.
  return { insertId: result.insertId, wasInserted: result.affectedRows > 0 };
};

const getGmailCredentials = async (userId) => {
  const [users] = await db.query(
    'SELECT gmail_token, refresh_token FROM users WHERE id = ?',
    [userId]
  );
  return users[0] || null;
};

const getLastHistoryId = async (userId) => {
  const [rows] = await db.query(
    'SELECT last_history_id FROM sync_status WHERE user_id = ?',
    [userId]
  );
  return rows[0]?.last_history_id || null;
};

// ── Sync lifecycle (sync_status) ────────────────
// See migrations/add_sync_status_lifecycle_columns.sql. Reuses the existing
// table rather than a separate one; the read side lives in
// modules/records/records.repository.js (GET /records/sync-status).

// Atomic concurrency guard + stuck-sync reclaim, in one statement: only
// claims the row if it's not currently 'syncing', OR it's been 'syncing' for
// longer than staleTimeoutMinutes (server crashed mid-sync, so it's actually
// stuck, not really in progress). A plain "read then write" here would race
// under concurrent requests — this UPDATE...WHERE is atomic at the DB level,
// so two simultaneous calls can't both believe they won the claim.
const startSync = async (userId, staleTimeoutMinutes) => {
  const [result] = await db.query(
    `UPDATE sync_status
     SET status = 'syncing', last_sync_started_at = NOW(),
         last_error_code = NULL, last_error_message = NULL
     WHERE user_id = ?
       AND (status != 'syncing' OR last_sync_started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE))`,
    [userId, staleTimeoutMinutes]
  );
  if (result.affectedRows > 0) return true; // claimed — either idle/success/failed, or a reclaimed stuck sync

  // No row yet for this user (first-ever sync) — the UPDATE above matched
  // nothing because there was nothing to match, not because it's genuinely
  // syncing right now.
  try {
    await db.query(
      `INSERT INTO sync_status (user_id, status, last_sync_started_at) VALUES (?, 'syncing', NOW())`,
      [userId]
    );
    return true;
  } catch (err) {
    // Lost a race against another request's INSERT for the same brand-new
    // user, or the UPDATE really did match a genuinely-in-progress row (not
    // stale) and just reported 0 affected rows — either way, not our claim.
    if (err.code === 'ER_DUP_ENTRY') return false;
    throw err;
  }
};

const completeSyncSuccess = async (userId, historyId, processedCount) => {
  await db.query(
    `UPDATE sync_status
     SET status = 'success', last_sync_at = NOW(), last_sync_finished_at = NOW(),
         last_history_id = ?, total_synced = total_synced + ?,
         last_error_code = NULL, last_error_message = NULL
     WHERE user_id = ?`,
    [historyId, processedCount, userId]
  );
};

// last_sync_at is deliberately untouched here — it must keep meaning "the
// last time a sync actually succeeded" so the frontend can tell stale data
// apart from fresh, even while status = 'failed'.
const completeSyncFailure = async (userId, errorCode, errorMessage) => {
  await db.query(
    `UPDATE sync_status
     SET status = 'failed', last_sync_finished_at = NOW(),
         last_error_code = ?, last_error_message = ?
     WHERE user_id = ?`,
    [errorCode, errorMessage, userId]
  );
};

// Distinct from completeSyncFailure — reserved for genuine Gmail auth
// failures (mapSyncError's GMAIL_AUTH_EXPIRED) where retrying without the
// user reconnecting Gmail can never succeed. See scheduler eligibility
// query below, which excludes this status from automatic retry.
const completeSyncNeedsReconnect = async (userId, errorCode, errorMessage) => {
  await db.query(
    `UPDATE sync_status
     SET status = 'needs_reconnect', last_sync_finished_at = NOW(),
         last_error_code = ?, last_error_message = ?
     WHERE user_id = ?`,
    [errorCode, errorMessage, userId]
  );
};

// BYOK hybrid AI (Project DOCs/BYOK.md) — distinct from completeSyncFailure
// and completeSyncNeedsReconnect. Fires when a user has no BYOK key
// connected and has exhausted their monthly free-tier AI quota. Like
// needs_reconnect, this can never self-resolve on a plain retry — the user
// must either connect a key or wait for the month to roll over — so it's
// excluded from scheduler eligibility below rather than retried every tick.
const completeSyncNeedsUpgradeOrKey = async (userId, processedCount) => {
  await db.query(
    `UPDATE sync_status
     SET status = 'needs_upgrade_or_key', last_sync_finished_at = NOW(),
         total_synced = total_synced + ?,
         last_error_code = 'QUOTA_EXCEEDED', last_error_message = 'Monthly free AI quota exceeded'
     WHERE user_id = ?`,
    [processedCount, userId]
  );
};

// User-initiated stop, distinct from completeSyncFailure — this wasn't an
// error, and last_history_id is deliberately left untouched here (unlike
// completeSyncSuccess) so the next sync still sees whatever messages were
// never attempted. total_synced still accounts for however many were
// actually processed before the stop landed.
const completeSyncStopped = async (userId, processedCount) => {
  await db.query(
    `UPDATE sync_status
     SET status = 'stopped', last_sync_finished_at = NOW(),
         total_synced = total_synced + ?,
         last_error_code = NULL, last_error_message = NULL
     WHERE user_id = ?`,
    [processedCount, userId]
  );
};

// Recovers a row stuck at status='syncing' whose owning process is gone —
// e.g. a dev-server restart (nodemon reload) mid-sync, or a crash — with no
// in-memory activeSyncs handle left to cancel (see requestStop() in
// pipeline.orchestrator.js). Only flips rows that are still 'syncing'; a
// no-op if the row already moved on (real race with a genuinely-finishing
// sync), so this can't clobber a legitimate concurrent completion.
const forceStopStuckSync = async (userId) => {
  const [result] = await db.query(
    `UPDATE sync_status
     SET status = 'stopped', last_sync_finished_at = NOW()
     WHERE user_id = ? AND status = 'syncing'`,
    [userId]
  );
  return result.affectedRows > 0;
};

// Users the scheduler may automatically sync right now. Excludes:
//  - 'stopped' / 'needs_reconnect' / 'needs_upgrade_or_key' — retrying these
//    automatically is either against the user's wishes (stopped) or
//    guaranteed to fail until they act (needs_reconnect: must reconnect
//    Gmail; needs_upgrade_or_key: must connect a BYOK key, upgrade, or wait
//    for the monthly quota to roll over) — all three just get skipped every
//    tick, not retried. A user auto-unblocks the moment they connect a key
//    (resolveChain returns BYOK before quota is even checked) or the month
//    rolls over — either way their next manual/scheduled sync attempt just
//    works, no separate "un-flag" step needed.
//  - a genuinely in-progress 'syncing' row — but only while it's fresh; a
//    'syncing' row older than staleTimeoutMinutes is stuck (crashed
//    process) and stays eligible, mirroring startSync()'s own reclaim rule
//    so the two never disagree about what counts as stale.
// Users with no sync_status row yet (first-ever sync) are eligible.
const getSchedulerEligibleUserIds = async (staleTimeoutMinutes) => {
  const [rows] = await db.query(
    `SELECT u.id
     FROM users u
     LEFT JOIN sync_status s ON s.user_id = u.id
     WHERE u.gmail_connected = 1
       AND (s.status IS NULL OR s.status NOT IN ('stopped', 'needs_reconnect', 'needs_upgrade_or_key'))
       AND (s.status IS NULL OR s.status != 'syncing'
            OR s.last_sync_started_at < DATE_SUB(NOW(), INTERVAL ? MINUTE))`,
    [staleTimeoutMinutes]
  );
  return rows.map((r) => r.id);
};

module.exports = {
  findExistingProcessedEmail,
  deleteProcessedEmail,
  insertProcessedEmail,
  updateProcessedEmailClassification,
  linkEmailToApplication,
  updateApplicationStatus,
  insertApplication,
  insertTimelineEvent,
  getGmailCredentials,
  getLastHistoryId,
  startSync,
  completeSyncSuccess,
  completeSyncFailure,
  completeSyncNeedsReconnect,
  completeSyncNeedsUpgradeOrKey,
  completeSyncStopped,
  forceStopStuckSync,
  getSchedulerEligibleUserIds,
};
