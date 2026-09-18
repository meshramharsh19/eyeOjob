const db = require('../../config/database');

const findAllByUser = async (userId) => {
  const [rows] = await db.query(
    `SELECT a.*,
      (SELECT COUNT(*) FROM timeline_events WHERE application_id = a.id) as event_count,
      DATEDIFF(NOW(), a.status_changed_at) as days_in_status
     FROM applications a
     WHERE a.user_id = ? AND a.deleted_at IS NULL
     ORDER BY a.updated_at DESC`,
    [userId]
  );
  return rows;
};

const findByIdForUser = async (id, userId) => {
  const [rows] = await db.query(
    'SELECT * FROM applications WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [id, userId]
  );
  return rows[0] || null;
};

// Phase 7: LEFT JOIN processed_emails (matching email_msg_id = gmail_msg_id,
// scoped by user_id so one user's timeline can never pick up another user's
// email row) so the journey timeline can show lightweight email context per
// event without a second round trip. Only lightweight fields are selected —
// never plain_text/raw_html (full body stays behind the lazy-load endpoint,
// GET /records/processed-emails/:id). Snippet is truncated to ~250 chars at
// the SQL layer as a defense-in-depth measure even though raw_snippet is
// already capped at ~500 by the pipeline writer.
// Dismissed events (is_dismissed = 1, Phase 8 soft-hide) are excluded by
// default — they're not deleted, just no longer shown on the journey.
const findTimeline = async (applicationId, userId, { includeDismissed = false } = {}) => {
  const [rows] = await db.query(
    `SELECT te.*,
            LEFT(pe.raw_snippet, 250) AS email_snippet,
            pe.subject AS email_subject,
            pe.sender AS email_sender,
            pe.received_at AS email_received_at_full,
            pe.gmail_msg_id AS email_gmail_msg_id,
            pe.id AS processed_email_id
     FROM timeline_events te
     LEFT JOIN processed_emails pe
       ON pe.gmail_msg_id = te.email_msg_id AND pe.user_id = ?
     WHERE te.application_id = ?
       ${includeDismissed ? '' : 'AND te.is_dismissed = 0'}
     ORDER BY te.event_date ASC`,
    [userId, applicationId]
  );
  return rows;
};

// Phase 8: soft-hide only — never a physical DELETE, mirroring
// applications.deleted_at's convention. Scoped through a join to
// applications.user_id so a user can never dismiss another user's event.
const dismissTimelineEvent = async (eventId, applicationId, userId) => {
  const [result] = await db.query(
    `UPDATE timeline_events te
     JOIN applications a ON a.id = te.application_id
     SET te.is_dismissed = 1, te.dismissed_at = NOW()
     WHERE te.id = ? AND te.application_id = ? AND a.user_id = ? AND a.deleted_at IS NULL`,
    [eventId, applicationId, userId]
  );
  return result.affectedRows > 0;
};

// Phase 8: manual milestone — a user-authored timeline entry, tagged
// metadata.source = 'manual' so the journey UI can distinguish it from
// pipeline-detected events. Uses the same insertTimelineEvent table as
// everything else — no parallel events table.
const addManualMilestone = async (applicationId, userId, { eventType, eventDate, description }) => {
  const owns = await db.query(
    'SELECT id FROM applications WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [applicationId, userId]
  );
  if (!owns[0].length) return null;

  const [result] = await db.query(
    `INSERT INTO timeline_events (application_id, event_type, event_date, description, metadata)
     VALUES (?, ?, ?, ?, ?)`,
    [applicationId, eventType, eventDate || new Date(), description, JSON.stringify({ source: 'manual' })]
  );
  return result.insertId;
};

const findEmails = async (applicationId) => {
  const [rows] = await db.query(
    'SELECT subject, sender, received_at, classification, confidence FROM processed_emails WHERE application_id = ? ORDER BY received_at ASC',
    [applicationId]
  );
  return rows;
};

const createApplication = async ({
  userId,
  company,
  role,
  normalizedCompany,
  normalizedRole,
  platform = 'Direct',
  status = 'Applied',
  appliedDate = null,
  location = null,
  jobId = null,
  notes = null,
  source = 'manual',
  isLockedByUser = 0,
  verificationStatus = 'verified',
  confidenceScore = 100.0,
}) => {
  const [result] = await db.query(
    `INSERT INTO applications
     (user_id, company, role, normalized_company, normalized_role,
      platform, status, applied_date, location, job_id, notes,
      source, is_locked_by_user, verification_status, confidence_score,
      created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      userId,
      company,
      role,
      normalizedCompany || null,
      normalizedRole || null,
      platform,
      status,
      appliedDate,
      location,
      jobId,
      notes,
      source,
      isLockedByUser ? 1 : 0,
      verificationStatus,
      confidenceScore,
    ]
  );
  return result.insertId;
};

const updateApplication = async (id, userId, fields) => {
  const {
    company,
    role,
    normalizedCompany,
    normalizedRole,
    platform,
    status,
    appliedDate,
    location,
    jobId,
    notes,
    isLockedByUser = 1,
    verificationStatus = 'verified',
    confidenceScore = 100.0,
    statusChanged = false,
  } = fields;

  const [result] = await db.query(
    `UPDATE applications
     SET company = COALESCE(?, company),
         role = COALESCE(?, role),
         normalized_company = COALESCE(?, normalized_company),
         normalized_role = COALESCE(?, normalized_role),
         platform = COALESCE(?, platform),
         status = COALESCE(?, status),
         applied_date = COALESCE(?, applied_date),
         location = COALESCE(?, location),
         job_id = COALESCE(?, job_id),
         notes = COALESCE(?, notes),
         is_locked_by_user = ?,
         verification_status = ?,
         confidence_score = ?,
         status_changed_at = ${statusChanged ? 'NOW()' : 'status_changed_at'},
         updated_at = NOW()
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [
      company,
      role,
      normalizedCompany,
      normalizedRole,
      platform,
      status,
      appliedDate,
      location,
      jobId,
      notes,
      isLockedByUser ? 1 : 0,
      verificationStatus,
      confidenceScore,
      id,
      userId,
    ]
  );
  return result.affectedRows > 0;
};

const updateStatus = async (id, userId, status, notes = null) => {
  await db.query(
    `UPDATE applications
     SET status = ?,
         notes = COALESCE(?, notes),
         is_locked_by_user = 1,
         verification_status = 'verified',
         confidence_score = 100.00,
         status_changed_at = NOW(),
         updated_at = NOW()
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [status, notes, id, userId]
  );
};

const softDeleteApplication = async (id, userId) => {
  const [result] = await db.query(
    `UPDATE applications
     SET deleted_at = NOW(),
         updated_at = NOW()
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId]
  );
  return result.affectedRows > 0;
};

const addTimelineEvent = async (applicationId, eventType, description) => {
  await db.query(
    `INSERT INTO timeline_events (application_id, event_type, event_date, description)
     VALUES (?, ?, NOW(), ?)`,
    [applicationId, eventType, description]
  );
};

const getStats = async (userId) => {
  const [stats] = await db.query(
    `SELECT
      COUNT(*) as total,
      SUM(status = 'Applied') as applied,
      SUM(status = 'Interview') as interview,
      SUM(status = 'Offer') as offers,
      SUM(status = 'Rejected') as rejected,
      SUM(verification_status = 'needs_review') as needs_review
     FROM applications
     WHERE user_id = ? AND deleted_at IS NULL`,
    [userId]
  );
  return stats[0];
};

module.exports = {
  findAllByUser,
  findByIdForUser,
  findTimeline,
  findEmails,
  createApplication,
  updateApplication,
  updateStatus,
  softDeleteApplication,
  addTimelineEvent,
  dismissTimelineEvent,
  addManualMilestone,
  getStats,
};
