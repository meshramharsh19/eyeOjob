// ──────────────────────────────────────────────────
// INTENT TAXONOMY
// Every email is classified into exactly one of these. Only LIFECYCLE_INTENTS
// continue to extraction (deterministic parser or AI); everything else is
// discarded right after classification.
// ──────────────────────────────────────────────────

const INTENTS = {
  APPLICATION_CONFIRMATION: 'application_confirmation',
  APPLICATION_UPDATE: 'application_update',
  INTERVIEW: 'interview',
  ASSESSMENT: 'assessment',
  OFFER: 'offer',
  REJECTION: 'rejection',
  JOB_RECOMMENDATION: 'job_recommendation',
  NEWSLETTER: 'newsletter',
  MARKETING: 'marketing',
  SECURITY: 'security',
  OTP: 'otp',
  OTHER: 'other',
};

// The six intents that represent a real step in a user's application lifecycle.
const LIFECYCLE_INTENTS = new Set([
  INTENTS.APPLICATION_CONFIRMATION,
  INTENTS.APPLICATION_UPDATE,
  INTENTS.INTERVIEW,
  INTENTS.ASSESSMENT,
  INTENTS.OFFER,
  INTENTS.REJECTION,
]);

const isLifecycleIntent = (intent) => LIFECYCLE_INTENTS.has(intent);

module.exports = { INTENTS, LIFECYCLE_INTENTS, isLifecycleIntent };
