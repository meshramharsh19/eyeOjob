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

const findTimeline = async (applicationId) => {
  const [rows] = await db.query(
    'SELECT * FROM timeline_events WHERE application_id = ? ORDER BY event_date ASC',
    [applicationId]
  );
  return rows;
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
  getStats,
};
