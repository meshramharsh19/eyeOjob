// ──────────────────────────────────────────────────
// MATCH SCORING
// Given a candidate application and an incoming email's signals, produces a
// 0-100 score. No single field (thread id, company, role) is trusted alone —
// this blends them, so the caller can threshold into auto-merge / review /
// auto-new instead of committing to the first weak match it finds.
// ──────────────────────────────────────────────────

const CLOSED_STATUSES = ['Rejected', 'Withdrawn', 'Ghosted', 'Closed', 'Offer'];

const ROLE_MATCH_SCORE = 40;
const LOCATION_MATCH_SCORE = 15;
const LOCATION_MISMATCH_PENALTY = -20;
const REOPEN_PENALTY = -50; // candidate already closed + incoming looks like a fresh application

const TIME_BUCKETS = [
  { withinDays: 7, score: 15 },
  { withinDays: 30, score: 8 },
  { withinDays: 90, score: 3 },
];

const daysBetween = (a, b) => Math.abs(new Date(a) - new Date(b)) / (1000 * 60 * 60 * 24);

const scoreTimeProximity = (candidateDate, incomingDate) => {
  if (!candidateDate || !incomingDate) return 0;
  const gap = daysBetween(candidateDate, incomingDate);
  const bucket = TIME_BUCKETS.find((b) => gap <= b.withinDays);
  return bucket ? bucket.score : 0;
};

// candidate: { id, normalized_company, normalized_role, location, status, job_id, applied_date, updated_at }
// incoming: { normalizedCompany, normalizedRole, location, jobId, eventType, receivedAt }
const computeMatchScore = ({ candidate, incoming }) => {
  const breakdown = {};

  // Company match is a precondition for even reaching this scorer (candidate
  // generation already filters on normalized_company), so it isn't scored here.

  if (incoming.normalizedRole && candidate.normalized_role) {
    if (incoming.normalizedRole === candidate.normalized_role) {
      breakdown.role = ROLE_MATCH_SCORE;
    } else {
      breakdown.role = 0;
    }
  }

  if (incoming.location && candidate.location) {
    breakdown.location = incoming.location === candidate.location
      ? LOCATION_MATCH_SCORE
      : LOCATION_MISMATCH_PENALTY;
  }

  breakdown.time = scoreTimeProximity(candidate.updated_at || candidate.applied_date, incoming.receivedAt);

  // Reapplication guard: candidate is already closed and this email looks like
  // a brand new application starting — bias hard toward treating it as new,
  // even though company/role/location may all line up.
  if (CLOSED_STATUSES.includes(candidate.status) && incoming.eventType === 'applied') {
    breakdown.reopenPenalty = REOPEN_PENALTY;
  }

  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
  return { score, breakdown };
};

const DECISION = {
  AUTO_MERGE: 'auto_merge',
  NEEDS_REVIEW: 'needs_review',
  AUTO_NEW: 'auto_new',
};

const HIGH_CONFIDENCE_THRESHOLD = 45;
const LOW_CONFIDENCE_THRESHOLD = 15;

const decideFromScore = (score) => {
  if (score >= HIGH_CONFIDENCE_THRESHOLD) return DECISION.AUTO_MERGE;
  if (score >= LOW_CONFIDENCE_THRESHOLD) return DECISION.NEEDS_REVIEW;
  return DECISION.AUTO_NEW;
};

module.exports = {
  computeMatchScore,
  decideFromScore,
  DECISION,
  CLOSED_STATUSES,
};
