// ──────────────────────────────────────────────────
// VERIFICATION
// Final gate before an application record is trusted: low confidence or a
// missing role/company means a human should double-check it, regardless of
// which extraction path (deterministic parser or AI) produced the data.
// Extracted out of the sync orchestrator so the review threshold lives in
// exactly one place.
// ──────────────────────────────────────────────────

const REVIEW_CONFIDENCE_THRESHOLD = 65;

const needsReview = (extraction, confidence) =>
  confidence < REVIEW_CONFIDENCE_THRESHOLD || !extraction.role || !extraction.company;

const verificationStatus = (extraction, confidence) =>
  needsReview(extraction, confidence) ? 'needs_review' : 'verified';

module.exports = { needsReview, verificationStatus, REVIEW_CONFIDENCE_THRESHOLD };
