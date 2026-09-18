// ── Granular lifecycle event taxonomy (Phase 2) ─────────────────────────
// These are TIMELINE event types — always written to timeline_events.
// They are strictly more granular than applications.status (the coarse
// enum, unchanged: Applied/OA/Interview/HR Round/Final Round/Offer/
// Rejected/Withdrawn/Ghosted). Every granular event maps to exactly one
// coarse status via EVENT_TO_STATUS below, which is what
// pipeline.orchestrator.js's existing STATUS_RANK/shouldApplyStatus
// protection continues to operate on. Adding a granular event type here
// never requires touching the status enum or the progression guard.
const EVENT_TYPES = Object.freeze({
  APPLIED: 'APPLIED',
  APPLICATION_RECEIVED: 'APPLICATION_RECEIVED',
  APPLICATION_UNDER_REVIEW: 'APPLICATION_UNDER_REVIEW',
  SHORTLISTED: 'SHORTLISTED',
  ASSESSMENT_INVITED: 'ASSESSMENT_INVITED',
  ASSESSMENT_COMPLETED: 'ASSESSMENT_COMPLETED',
  ASSESSMENT_PASSED: 'ASSESSMENT_PASSED',
  ASSESSMENT_FAILED: 'ASSESSMENT_FAILED',
  INTERVIEW_INVITED: 'INTERVIEW_INVITED',
  INTERVIEW_SCHEDULED: 'INTERVIEW_SCHEDULED',
  INTERVIEW_COMPLETED: 'INTERVIEW_COMPLETED',
  INTERVIEW_PASSED: 'INTERVIEW_PASSED',
  INTERVIEW_FAILED: 'INTERVIEW_FAILED',
  OFFER_RECEIVED: 'OFFER_RECEIVED',
  OFFER_ACCEPTED: 'OFFER_ACCEPTED',
  OFFER_DECLINED: 'OFFER_DECLINED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
  // Non-lifecycle / housekeeping event types kept for compatibility with
  // existing manual CRUD and correspondence-only entries (see
  // applications.repository.js / pipeline.orchestrator.js callers).
  CORRESPONDENCE: 'correspondence',
  MANUAL_CREATE: 'manual_create',
  MANUAL_UPDATE: 'manual_update',
  MANUAL_MILESTONE: 'manual_milestone',
  MANUAL_DELETE: 'manual_delete',
});

// Granular event_type -> coarse applications.status. This is the ONLY place
// that decides what a granular event means for the coarse status column —
// pipeline.orchestrator.js's shouldApplyStatus()/STATUS_RANK/TERMINAL_STATUSES
// guard still gates whether that mapped status is actually written.
const EVENT_TO_STATUS = Object.freeze({
  [EVENT_TYPES.APPLIED]: 'Applied',
  [EVENT_TYPES.APPLICATION_RECEIVED]: 'Applied',
  [EVENT_TYPES.APPLICATION_UNDER_REVIEW]: 'Applied',
  [EVENT_TYPES.SHORTLISTED]: 'Applied',
  [EVENT_TYPES.ASSESSMENT_INVITED]: 'OA',
  [EVENT_TYPES.ASSESSMENT_COMPLETED]: 'OA',
  [EVENT_TYPES.ASSESSMENT_PASSED]: 'OA',
  [EVENT_TYPES.ASSESSMENT_FAILED]: 'Rejected',
  [EVENT_TYPES.INTERVIEW_INVITED]: 'Interview',
  [EVENT_TYPES.INTERVIEW_SCHEDULED]: 'Interview',
  [EVENT_TYPES.INTERVIEW_COMPLETED]: 'Interview',
  [EVENT_TYPES.INTERVIEW_PASSED]: 'Interview',
  [EVENT_TYPES.INTERVIEW_FAILED]: 'Rejected',
  [EVENT_TYPES.OFFER_RECEIVED]: 'Offer',
  [EVENT_TYPES.OFFER_ACCEPTED]: 'Offer',
  [EVENT_TYPES.OFFER_DECLINED]: 'Withdrawn',
  [EVENT_TYPES.REJECTED]: 'Rejected',
  [EVENT_TYPES.WITHDRAWN]: 'Withdrawn',
});

const mapEventTypeToStatus = (eventType) => EVENT_TO_STATUS[eventType] || null;

// Best-effort mapping from the AI/ATS-parser coarse `status` string (Applied,
// Assessment, OA, Interview, HR Round, Technical Round, Managerial Round,
// Final Round, Offer, Rejected, Withdrawn) to the closest granular event
// type, used when extraction only produced the old coarse field (Phase 3
// fallback path) rather than a granular event_type directly.
const STATUS_STRING_TO_EVENT = Object.freeze({
  'Applied': EVENT_TYPES.APPLIED,
  'Assessment': EVENT_TYPES.ASSESSMENT_INVITED,
  'OA': EVENT_TYPES.ASSESSMENT_INVITED,
  'Interview': EVENT_TYPES.INTERVIEW_INVITED,
  'HR Round': EVENT_TYPES.INTERVIEW_SCHEDULED,
  'Technical Round': EVENT_TYPES.INTERVIEW_SCHEDULED,
  'Managerial Round': EVENT_TYPES.INTERVIEW_SCHEDULED,
  'Final Round': EVENT_TYPES.INTERVIEW_SCHEDULED,
  'Offer': EVENT_TYPES.OFFER_RECEIVED,
  'Rejected': EVENT_TYPES.REJECTED,
  'Withdrawn': EVENT_TYPES.WITHDRAWN,
});

const mapStatusStringToEventType = (status) => STATUS_STRING_TO_EVENT[status] || null;

const LIFECYCLE_EVENT_TYPES = new Set(Object.keys(EVENT_TO_STATUS));
const isLifecycleEventType = (eventType) => LIFECYCLE_EVENT_TYPES.has(eventType);

module.exports = {
  EVENT_TYPES,
  EVENT_TO_STATUS,
  mapEventTypeToStatus,
  mapStatusStringToEventType,
  isLifecycleEventType,
};
