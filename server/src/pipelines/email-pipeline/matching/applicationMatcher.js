const db = require('../../../config/database');
const { computeMatchScore, decideFromScore, DECISION } = require('./scoring.service');

// ──────────────────────────────────────────────────
// APPLICATION MATCHER
// Decides whether an incoming email belongs to an existing application or
// starts a new one. Hard rules run first (near-certain signals); anything
// left ambiguous falls through to weighted scoring across a candidate set,
// which resolves to auto_merge / needs_review / auto_new.
// ──────────────────────────────────────────────────

const CANDIDATE_WINDOW_DAYS = 180;

// Strategy 1: reply-chain headers — if this email is a reply within a thread
// we've already linked to an application, it's certainly the same application.
const findByMessageHeaders = async (userId, { inReplyTo, references }) => {
  if (!inReplyTo && !references) return null;

  const refs = [inReplyTo, ...(references?.split(' ') || [])].filter(Boolean);
  for (const ref of refs) {
    const [rows] = await db.query(
      `SELECT a.* FROM applications a
       JOIN processed_emails p ON a.id = p.application_id
       WHERE a.user_id = ? AND p.message_id_header = ? AND a.deleted_at IS NULL
       LIMIT 1`,
      [userId, ref.trim()]
    );
    if (rows.length > 0) return rows[0];
  }
  return null;
};

// Strategy 2: same Gmail thread — Gmail already grouped these messages together.
const findByGmailThread = async (userId, gmailThreadId) => {
  if (!gmailThreadId) return null;
  const [rows] = await db.query(
    `SELECT a.* FROM applications a
     JOIN processed_emails p ON a.source_email_thread_id = p.gmail_thread_id
     WHERE a.user_id = ? AND p.gmail_thread_id = ? AND a.deleted_at IS NULL
     LIMIT 1`,
    [userId, gmailThreadId]
  );
  return rows[0] || null;
};

// Strategy 3: exact Job ID match — the strongest content signal when present.
const findByJobId = async (userId, jobId) => {
  if (!jobId) return null;
  const [rows] = await db.query(
    'SELECT * FROM applications WHERE user_id = ? AND job_id = ? AND deleted_at IS NULL LIMIT 1',
    [userId, jobId]
  );
  return rows[0] || null;
};

// Candidate generation for weighted scoring: same user, same normalized
// company, recent enough to plausibly be the same application.
const findCandidates = async (userId, normalizedCompany) => {
  if (!normalizedCompany) return [];
  const [rows] = await db.query(
    `SELECT * FROM applications
     WHERE user_id = ? AND normalized_company = ? AND deleted_at IS NULL
     AND updated_at > DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY updated_at DESC
     LIMIT 10`,
    [userId, normalizedCompany, CANDIDATE_WINDOW_DAYS]
  );
  return rows;
};

// incoming: { gmailThreadId, messageIdHeader, inReplyTo, references,
//             normalizedCompany, normalizedRole, location, jobId,
//             eventType, receivedAt }
const matchApplication = async (userId, incoming) => {
  const headerMatch = await findByMessageHeaders(userId, incoming);
  if (headerMatch) {
    return { application: headerMatch, decision: DECISION.AUTO_MERGE, strategy: 'message_id_header', score: 100 };
  }

  const threadMatch = await findByGmailThread(userId, incoming.gmailThreadId);
  if (threadMatch) {
    return { application: threadMatch, decision: DECISION.AUTO_MERGE, strategy: 'thread_id', score: 100 };
  }

  const jobIdMatch = await findByJobId(userId, incoming.jobId);
  if (jobIdMatch) {
    return { application: jobIdMatch, decision: DECISION.AUTO_MERGE, strategy: 'job_id', score: 100 };
  }

  const candidates = await findCandidates(userId, incoming.normalizedCompany);
  if (candidates.length === 0) {
    return { application: null, decision: DECISION.AUTO_NEW, strategy: 'no_candidates', score: 0 };
  }

  // A candidate with its own job_id that differs from the incoming job_id is
  // a confirmed different opening at the same company — exclude it outright,
  // even if role/location/time would otherwise score well.
  const eligible = candidates.filter((c) => !(incoming.jobId && c.job_id && c.job_id !== incoming.jobId));
  if (eligible.length === 0) {
    return { application: null, decision: DECISION.AUTO_NEW, strategy: 'job_id_conflict', score: 0 };
  }

  let best = null;
  for (const candidate of eligible) {
    const { score, breakdown } = computeMatchScore({ candidate, incoming });
    if (!best || score > best.score) {
      best = { candidate, score, breakdown };
    }
  }

  const decision = decideFromScore(best.score);
  return {
    application: decision === DECISION.AUTO_NEW ? null : best.candidate,
    decision,
    strategy: 'weighted_score',
    score: best.score,
    breakdown: best.breakdown,
  };
};

module.exports = { matchApplication };
