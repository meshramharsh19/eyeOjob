const logger = require('../../config/logger');
const repository = require('./notifications.repository');

// Centralized event_type -> presentation mapping (Reaad.md notification spec
// §6) so titles/severity never get scattered across the pipeline. Only
// lifecycle stages worth interrupting the user for get an entry here —
// 'Applied' and 'Withdrawn' are deliberately absent (see isNotifiableStatus).
const STATUS_EVENT_MAP = {
  OA: { eventType: 'assessment', severity: 'info', title: 'Assessment Received' },
  'Interview': { eventType: 'interview', severity: 'success', title: 'Interview Invitation' },
  'HR Round': { eventType: 'interview', severity: 'success', title: 'HR Round Update' },
  'Final Round': { eventType: 'interview', severity: 'success', title: 'Final Round Interview' },
  Offer: { eventType: 'offer', severity: 'success', title: 'Offer Received' },
  Rejected: { eventType: 'rejection', severity: 'warning', title: 'Application Rejected' },
};

const isNotifiableStatus = (status) => Object.prototype.hasOwnProperty.call(STATUS_EVENT_MAP, status);

// Phase 6: granular event_type -> presentation mapping. Used in addition to
// STATUS_EVENT_MAP above (not instead of) — coarse status-change events keep
// going through notifyStatusEvent for backward compatibility; this covers
// granular events that are notification-worthy even when they don't move
// the coarse status (e.g. INTERVIEW_COMPLETED, ASSESSMENT_PASSED) or that
// need a more specific title than the coarse mapping gives (ASSESSMENT_FAILED
// vs a generic "Rejected").
const EVENT_TYPE_MAP = {
  ASSESSMENT_PASSED: { eventType: 'assessment_passed', severity: 'success', title: 'Assessment Passed' },
  ASSESSMENT_FAILED: { eventType: 'assessment_failed', severity: 'warning', title: 'Assessment Not Cleared' },
  INTERVIEW_SCHEDULED: { eventType: 'interview_scheduled', severity: 'success', title: 'Interview Scheduled' },
  INTERVIEW_COMPLETED: { eventType: 'interview_completed', severity: 'info', title: 'Interview Completed' },
  INTERVIEW_PASSED: { eventType: 'interview_passed', severity: 'success', title: 'Interview Round Passed' },
  INTERVIEW_FAILED: { eventType: 'interview_failed', severity: 'warning', title: 'Interview Not Cleared' },
  OFFER_RECEIVED: { eventType: 'offer_received', severity: 'success', title: 'Offer Received' },
  REJECTED: { eventType: 'rejected', severity: 'warning', title: 'Application Rejected' },
};

const isNotifiableEventType = (eventType) => Object.prototype.hasOwnProperty.call(EVENT_TYPE_MAP, eventType);

// Called from pipeline.orchestrator.js at the two points a pipeline-detected
// status actually lands: an existing application's status being applied, or
// a new application being created directly at an already-important status
// (e.g. the first email ever seen from a company is already an interview
// invite). Never called from manual user edits — the user already knows
// about a change they made themselves.
//
// isInitialSync suppresses notifications during a user's first/full-relist
// sync (Reaad.md §2) so 100 historical emails don't produce a notification
// storm for events that happened weeks ago; the application/timeline data
// itself is still written normally by the caller regardless of this flag.
const notifyStatusEvent = async (
  { applicationId, userId, status, company, role, emailMsgId, isInitialSync }
) => {
  if (isInitialSync) return null;
  if (!isNotifiableStatus(status)) return null;

  const { eventType, severity, title } = STATUS_EVENT_MAP[status];
  const parts = [company, role].filter((p) => p && p.trim().toLowerCase() !== 'not specified');
  const body = parts.length > 0 ? parts.join(' — ') : ([company, role].filter(Boolean).join(' — ') || null);

  try {
    return await repository.insert({
      userId, applicationId, emailMsgId, eventType, severity, title, body,
    });
  } catch (err) {
    // Notification delivery is best-effort UI sugar, not core pipeline
    // correctness — a failure here must never break the sync that's
    // creating/updating the underlying application.
    logger.error(`[notifications.service] failed to create notification for user ${userId}, application ${applicationId}:`, err.message);
    return null;
  }
};

// Granular counterpart to notifyStatusEvent — called from
// pipeline.orchestrator.js whenever a lifecycle event is notification-worthy
// on its own merits, independent of whether it moved the coarse status
// (e.g. INTERVIEW_COMPLETED, ASSESSMENT_PASSED never change the coarse
// "Interview"/"OA" stage but are still worth surfacing). Duplicate
// protection is the same uq_user_email_event unique key on notifications
// (user_id, email_msg_id, event_type) — INSERT IGNORE makes a reprocessed
// message's repeat call a no-op.
const notifyEventType = async (
  { applicationId, userId, eventType, company, role, emailMsgId, isInitialSync }
) => {
  if (isInitialSync) return null;
  if (!isNotifiableEventType(eventType)) return null;

  const { eventType: notifType, severity, title } = EVENT_TYPE_MAP[eventType];
  const parts = [company, role].filter((p) => p && p.trim().toLowerCase() !== 'not specified');
  const body = parts.length > 0 ? parts.join(' — ') : ([company, role].filter(Boolean).join(' — ') || null);

  try {
    return await repository.insert({
      userId, applicationId, emailMsgId, eventType: notifType, severity, title, body,
    });
  } catch (err) {
    logger.error(`[notifications.service] failed to create event notification for user ${userId}, application ${applicationId}:`, err.message);
    return null;
  }
};

const listForUser = async (userId, pagination) => repository.findByUser(userId, pagination);

const getUnreadCount = async (userId) => repository.getUnreadCount(userId);

const markRead = async (id, userId) => repository.markRead(id, userId);

const markAllRead = async (userId) => repository.markAllRead(userId);

module.exports = { notifyStatusEvent, notifyEventType, listForUser, getUnreadCount, markRead, markAllRead };
