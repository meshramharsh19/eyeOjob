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

const listForUser = async (userId, pagination) => repository.findByUser(userId, pagination);

const getUnreadCount = async (userId) => repository.getUnreadCount(userId);

const markRead = async (id, userId) => repository.markRead(id, userId);

const markAllRead = async (userId) => repository.markAllRead(userId);

module.exports = { notifyStatusEvent, listForUser, getUnreadCount, markRead, markAllRead };
