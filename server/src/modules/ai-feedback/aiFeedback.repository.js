const db = require('../../config/database');

// AI Correction Feedback Loop — Project DOCs/ai-feedback-loop.md.
// Everything in this file is pure DB access; the "is this actually a
// correction worth recording" decision (§2/§4) lives in aiFeedback.service.js
// and applications.service.js, not here.

// §4.1 — exact culprit-email resolution for a STATUS correction. Deliberately
// keys on timeline_events.applied_status (see
// migrations/add_timeline_events_applied_status.sql), never on "most recent
// email by timestamp": a correspondence-only email (survey, follow-up after
// a terminal/locked status) can arrive after the real status-setting one and
// would otherwise be misattributed as the culprit. Scoped by both
// application_id and pe.user_id so this can never cross into another user's
// processed_emails row.
const findStatusCorrectionCulprit = async (applicationId, userId, existingStatus) => {
  const [rows] = await db.query(
    `SELECT te.email_msg_id, pe.id AS processed_email_id, pe.sender_domain,
            pe.subject, pe.classification, pe.confidence
     FROM timeline_events te
     JOIN processed_emails pe ON pe.gmail_msg_id = te.email_msg_id AND pe.user_id = ?
     WHERE te.application_id = ? AND te.applied_status = ?
     ORDER BY te.id DESC
     LIMIT 1`,
    [userId, applicationId, existingStatus]
  );
  return rows[0] || null;
};

// §4 — company/role corrections attribute to the email that ORIGINALLY
// created the application (the wrong entity value came from there), not the
// most recent one.
const findCreationEmail = async (applicationId, userId) => {
  const [rows] = await db.query(
    `SELECT id AS processed_email_id, sender_domain, subject, classification, confidence
     FROM processed_emails
     WHERE application_id = ? AND user_id = ?
     ORDER BY received_at ASC
     LIMIT 1`,
    [applicationId, userId]
  );
  return rows[0] || null;
};

const insertFeedback = async ({
  userId, applicationId, processedEmailId = null, fieldCorrected,
  aiPredictedValue = null, userCorrectedValue = null,
  senderDomain = null, emailSubject = null, aiClassification = null, aiConfidence = null,
}) => {
  const [result] = await db.query(
    `INSERT INTO ai_correction_feedback
     (user_id, application_id, processed_email_id, field_corrected,
      ai_predicted_value, user_corrected_value, sender_domain, email_subject,
      ai_classification, ai_confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId, applicationId, processedEmailId, fieldCorrected,
      aiPredictedValue, userCorrectedValue, senderDomain, emailSubject,
      aiClassification, aiConfidence,
    ]
  );
  return result.insertId;
};

// Consumer 2 (§5.2) — bounded few-shot lookup. Scoped to field_corrected IN
// ('status', 'false_positive') only: those are the two corrections that
// inform intent/status CLASSIFICATION, which is what the prompt actually
// decides. Company/role corrections are handled entirely by the alias
// tables (Consumer 1) instead of prompt injection — the second-developer
// review's point stands: a status correction must never become a
// sender-domain-wide rule, since the same domain legitimately sends
// confirmations, interviews, offers, AND rejections. Scoped to THIS user's
// own corrections only (never cross-user) and capped at `limit` (default 2,
// per the doc's "at most 1-2 examples" bound) to avoid token bloat/context
// pollution. Joins processed_emails for a short snippet so the example is a
// real (input, correct-output) pair, not just a bare label.
const findFewShotCorrections = async (userId, senderDomain, limit = 2) => {
  if (!senderDomain) return [];
  const [rows] = await db.query(
    `SELECT f.field_corrected, f.ai_predicted_value, f.user_corrected_value,
            f.email_subject, LEFT(pe.raw_snippet, 300) AS email_snippet
     FROM ai_correction_feedback f
     LEFT JOIN processed_emails pe ON pe.id = f.processed_email_id
     WHERE f.user_id = ? AND f.sender_domain = ?
       AND f.field_corrected IN ('status', 'false_positive')
     ORDER BY f.created_at DESC
     LIMIT ?`,
    [userId, senderDomain, limit]
  );
  return rows;
};

// Consumer 3 (§5.3) — offline deterministic-parser/keyword mining. Not on
// any hot path; a reporting/admin helper for deciding what to hand-code
// next into ats.parsers.js / classifier.service.js. HAVING frequency >= 3
// is a fixed default (matches the doc); exposed as a param since the useful
// threshold will only become clear once there's real correction volume.
const findCorrectionClusters = async (minFrequency = 3) => {
  const [rows] = await db.query(
    `SELECT sender_domain, field_corrected, ai_predicted_value, user_corrected_value,
            COUNT(*) AS frequency
     FROM ai_correction_feedback
     GROUP BY sender_domain, field_corrected, ai_predicted_value, user_corrected_value
     HAVING frequency >= ?
     ORDER BY frequency DESC`,
    [minFrequency]
  );
  return rows;
};

module.exports = {
  findStatusCorrectionCulprit,
  findCreationEmail,
  insertFeedback,
  findFewShotCorrections,
  findCorrectionClusters,
};
