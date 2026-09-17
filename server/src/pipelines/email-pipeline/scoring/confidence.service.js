// ──────────────────────────────────────────────────
// CONFIDENCE CALCULATOR
// Produces one unified 0-100 score regardless of which stage produced the
// extraction (deterministic parser vs AI), so downstream needs_review /
// verification_status logic doesn't need to know which path was taken.
// ──────────────────────────────────────────────────

const calculateConfidence = ({ source, ruleConfidence = 0, aiConfidence = 0, company, role, status }) => {
  if (source === 'deterministic_parser') {
    // Regex extraction only ever runs after passesSanityCheck() confirms company+role,
    // so this always starts from a solid base — capped below what a confident AI read
    // can reach, since a rigid pattern match is never 100% certain it parsed correctly.
    let score = 55;
    if (company) score += 15;
    if (role) score += 15;
    if (status) score += 10;
    return Math.min(score, 92);
  }

  // AI path — blend the cheap rule-based signal with the model's own confidence
  return Math.min((ruleConfidence * 0.4) + (aiConfidence * 0.6), 100);
};

module.exports = { calculateConfidence };
