const logger = require('../../config/logger');
const { NotFoundError, BadRequestError, ConflictError } = require('../../errors');
const applicationsRepository = require('./applications.repository');
const { syncUserEmails, requestStop, forceStopStuckSync } = require('../../pipelines/email-pipeline');
const { normalizeCompany, normalizeRole } = require('../../pipelines/email-pipeline/matching/normalization.service');
const aiFeedbackService = require('../ai-feedback/aiFeedback.service');

// AI Correction Feedback Loop (Project DOCs/ai-feedback-loop.md §2) — a
// user edit only counts as a genuine "AI was wrong" signal when it's the
// FIRST override of a value the AI itself produced. A manually-created
// application has no AI baseline (source !== 'email'); an already-locked
// application's next edit is a second human tweak, not a new disagreement.
const isEligibleForCorrectionSignal = (application) =>
  application.source === 'email' && !application.is_locked_by_user;

const VALID_DELETE_REASONS = new Set(['not_a_job', 'duplicate', 'withdrawn', 'other']);

const ALLOWED_STATUSES = new Set([
  'Applied',
  'OA',
  'Interview',
  'HR Round',
  'Final Round',
  'Offer',
  'Rejected',
  'Withdrawn',
  'Ghosted',
  'Closed',
]);

const triggerSync = async (userId) => syncUserEmails(userId);

const stopSync = async (userId) => {
  if (requestStop(userId)) return;

  const recovered = await forceStopStuckSync(userId);
  if (!recovered) throw new ConflictError('No sync is currently in progress.');
};

const STUCK_STATUS_THRESHOLD_DAYS = 14;
const TERMINAL_STATUSES = new Set(['Offer', 'Rejected', 'Withdrawn', 'Ghosted', 'Closed']);

const computeNeedsReview = (application) => {
  const lowConfidence = application.verification_status === 'needs_review';

  const daysInStatus = application.days_in_status ?? null;
  const stuckInStatus =
    daysInStatus !== null &&
    daysInStatus > STUCK_STATUS_THRESHOLD_DAYS &&
    !TERMINAL_STATUSES.has(application.status);

  const reasons = [];
  if (lowConfidence) reasons.push('AI parser confidence below threshold (needs manual verification)');
  if (stuckInStatus) reasons.push(`No status change in ${daysInStatus} days (still "${application.status}")`);

  return {
    isReviewRequired: lowConfidence || stuckInStatus,
    lowConfidence,
    stuckInStatus,
    daysInStatus,
    reasons,
  };
};

const listForUser = async (userId) => {
  const applications = await applicationsRepository.findAllByUser(userId);
  return applications.map((application) => ({
    ...application,
    needsReview: computeNeedsReview(application),
  }));
};

// "Awaiting Update" (spec §4): presentation-layer-only — computed here so it
// ships to the client as a plain boolean/label, but NEVER persisted as a
// status. Silence is never inferred as Rejected/Withdrawn/Ghosted/Closed;
// this is purely "no status change in a while and the application is still
// open".
const AWAITING_UPDATE_THRESHOLD_DAYS = 14;

const computeAwaitingUpdate = (application) => {
  if (TERMINAL_STATUSES.has(application.status)) return false;
  if (!application.status_changed_at) return false;
  const days = (Date.now() - new Date(application.status_changed_at).getTime()) / 86400000;
  return days > AWAITING_UPDATE_THRESHOLD_DAYS;
};

const getWithTimeline = async (id, userId) => {
  const application = await applicationsRepository.findByIdForUser(id, userId);
  if (!application) throw new NotFoundError('Application not found');

  const [timeline, emails] = await Promise.all([
    applicationsRepository.findTimeline(id, userId),
    applicationsRepository.findEmails(id),
  ]);

  return {
    application: { ...application, awaitingUpdate: computeAwaitingUpdate(application) },
    timeline,
    emails,
  };
};

const createManualApplication = async (userId, data = {}) => {
  const company = data.company?.trim();
  const role = data.role?.trim();

  if (!company) throw new BadRequestError('Company name is required.');
  if (!role) throw new BadRequestError('Role / Job title is required.');

  const status = data.status || 'Applied';
  if (!ALLOWED_STATUSES.has(status)) {
    throw new BadRequestError(`Invalid status "${status}". Allowed: ${Array.from(ALLOWED_STATUSES).join(', ')}`);
  }

  // Normalization ensures the AI matcher can locate manual entries as legitimate candidates
  const [normalizedCompany, normalizedRole] = await Promise.all([
    normalizeCompany(userId, company),
    normalizeRole(userId, role),
  ]);

  // As decided: manual create starts with is_locked_by_user = false (unless explicitly requested)
  // so incoming emails can advance the interview/offer status automatically
  const isLocked = Boolean(data.is_locked_by_user || false);

  const newId = await applicationsRepository.createApplication({
    userId,
    company,
    role,
    normalizedCompany,
    normalizedRole,
    platform: data.platform?.trim() || 'Direct',
    status,
    appliedDate: data.applied_date ? new Date(data.applied_date) : null,
    location: data.location?.trim() || null,
    jobId: data.job_id?.trim() || null,
    notes: data.notes?.trim() || null,
    source: 'manual',
    isLockedByUser: isLocked,
    verificationStatus: 'verified',
    confidenceScore: 100.0,
  });

  await applicationsRepository.addTimelineEvent(
    newId,
    'manual_create',
    `Application manually logged for ${role} at ${company}. Starting status: ${status}.`
  );

  return applicationsRepository.findByIdForUser(newId, userId);
};

const updateManualApplication = async (id, userId, data = {}) => {
  const existing = await applicationsRepository.findByIdForUser(id, userId);
  if (!existing) throw new NotFoundError('Application not found');

  // Captured BEFORE any mutation — this is what decides whether each
  // changed field below is a genuine AI-correction signal (§2 of the
  // feedback-loop doc). Once updates.isLockedByUser flips to 1 below, this
  // application no longer qualifies for the NEXT edit's correction signal,
  // which is exactly the intended "only the first override counts" rule.
  const eligibleForSignal = isEligibleForCorrectionSignal(existing);

  const updates = {};

  if (data.company !== undefined) {
    const trimmed = data.company?.trim();
    if (!trimmed) throw new BadRequestError('Company name cannot be empty.');
    updates.company = trimmed;
    updates.normalizedCompany = await normalizeCompany(userId, trimmed);
  }

  if (data.role !== undefined) {
    const trimmed = data.role?.trim();
    if (!trimmed) throw new BadRequestError('Role cannot be empty.');
    updates.role = trimmed;
    updates.normalizedRole = await normalizeRole(userId, trimmed);
  }

  if (data.status !== undefined) {
    if (!ALLOWED_STATUSES.has(data.status)) {
      throw new BadRequestError(`Invalid status "${data.status}".`);
    }
    updates.status = data.status;
  }

  if (data.platform !== undefined) updates.platform = data.platform?.trim() || 'Direct';
  if (data.location !== undefined) updates.location = data.location?.trim() || null;
  if (data.job_id !== undefined) updates.jobId = data.job_id?.trim() || null;
  if (data.notes !== undefined) updates.notes = data.notes?.trim() || null;
  if (data.applied_date !== undefined) {
    updates.appliedDate = data.applied_date ? new Date(data.applied_date) : null;
  }

  // Any manual edit or status change locks the row to protect user's manual correction
  updates.isLockedByUser = data.is_locked_by_user !== undefined ? (data.is_locked_by_user ? 1 : 0) : 1;
  updates.verificationStatus = 'verified';
  updates.confidenceScore = 100.0;
  // Only bump status_changed_at when the status itself actually changes —
  // editing notes/salary/location/etc. must not reset the "days in status" clock.
  updates.statusChanged = data.status !== undefined && data.status !== existing.status;

  await applicationsRepository.updateApplication(id, userId, updates);

  // AI Correction Feedback Loop (§2/§4) — fire-and-record, never fatal to
  // the update itself. Each field is checked independently since a single
  // edit can correct more than one field at once (e.g. status AND company
  // in the same request).
  if (eligibleForSignal) {
    try {
      if (updates.status !== undefined && updates.status !== existing.status) {
        await aiFeedbackService.recordStatusCorrection({
          userId, applicationId: id, existingStatus: existing.status, newStatus: updates.status,
        });
      }
      if (updates.company !== undefined && updates.company !== existing.company) {
        await aiFeedbackService.recordEntityCorrection({
          userId, applicationId: id, field: 'company',
          oldValue: existing.company, newValue: updates.company, newNormalizedValue: updates.normalizedCompany,
        });
      }
      if (updates.role !== undefined && updates.role !== existing.role) {
        await aiFeedbackService.recordEntityCorrection({
          userId, applicationId: id, field: 'role',
          oldValue: existing.role, newValue: updates.role, newNormalizedValue: updates.normalizedRole,
        });
      }
    } catch (err) {
      logger.error(`[applications.service] AI correction feedback recording failed for application ${id} (non-fatal, update already succeeded):`, err.message);
    }
  }

  // Generate audit trail in timeline
  let description = 'Application details updated by user.';
  if (data.status && data.status !== existing.status) {
    description = `Status manually changed from ${existing.status} to ${data.status}.`;
  }
  if (data.notes && data.notes !== existing.notes) {
    description += ` Notes: ${data.notes}`;
  }

  await applicationsRepository.addTimelineEvent(id, 'manual_update', description);

  return applicationsRepository.findByIdForUser(id, userId);
};

const updateStatus = async (id, userId, { status, notes }) => {
  return updateManualApplication(id, userId, { status, notes });
};

// AI Correction Feedback Loop (§2/§4) — `reason` is optional and, if
// present, must be one of the known values; an unrecognized string is
// rejected rather than silently ignored, so the UI can't drift out of sync
// with what the backend actually understands. Only reason === 'not_a_job'
// on a source === 'email' application emits a false_positive signal — every
// other reason (duplicate/withdrawn/other) is a normal delete, not a
// model-quality issue (§2's table).
const deleteApplication = async (id, userId, { reason } = {}) => {
  if (reason !== undefined && !VALID_DELETE_REASONS.has(reason)) {
    throw new BadRequestError(`Invalid delete reason "${reason}". Allowed: ${Array.from(VALID_DELETE_REASONS).join(', ')}`);
  }

  const existing = await applicationsRepository.findByIdForUser(id, userId);
  if (!existing) throw new NotFoundError('Application not found');

  await applicationsRepository.softDeleteApplication(id, userId);
  await applicationsRepository.addTimelineEvent(
    id,
    'manual_delete',
    `Application for ${existing.role} at ${existing.company} was removed by user.${reason ? ` Reason: ${reason}.` : ''}`
  );

  if (reason === 'not_a_job' && existing.source === 'email') {
    try {
      await aiFeedbackService.recordFalsePositive({
        userId, applicationId: id, company: existing.company, role: existing.role,
      });
    } catch (err) {
      logger.error(`[applications.service] AI correction feedback (false_positive) recording failed for application ${id} (non-fatal, delete already succeeded):`, err.message);
    }
  }

  return { success: true, message: 'Application deleted successfully' };
};

const getStats = async (userId) => applicationsRepository.getStats(userId);

// Phase 8: Dismiss Event — soft-hide, never a physical delete (matches
// applications.deleted_at convention elsewhere in this module).
const dismissEvent = async (applicationId, eventId, userId) => {
  const application = await applicationsRepository.findByIdForUser(applicationId, userId);
  if (!application) throw new NotFoundError('Application not found');

  const ok = await applicationsRepository.dismissTimelineEvent(eventId, applicationId, userId);
  if (!ok) throw new NotFoundError('Timeline event not found');
  return { success: true };
};

// Phase 8: Add Custom Milestone — a manual timeline entry tagged
// metadata.source = 'manual' via addManualMilestone(). Deliberately does NOT
// touch applications.status — a milestone is purely a journey annotation,
// not a status change (use the existing update/updateStatus endpoints for that).
const addMilestone = async (applicationId, userId, { eventType, eventDate, description } = {}) => {
  const application = await applicationsRepository.findByIdForUser(applicationId, userId);
  if (!application) throw new NotFoundError('Application not found');
  if (!description?.trim()) throw new BadRequestError('A description is required for a custom milestone.');

  const id = await applicationsRepository.addManualMilestone(applicationId, userId, {
    eventType: eventType?.trim() || 'MANUAL_MILESTONE',
    eventDate: eventDate ? new Date(eventDate) : new Date(),
    description: description.trim(),
  });
  if (!id) throw new NotFoundError('Application not found');
  return { success: true, id };
};

module.exports = {
  triggerSync,
  stopSync,
  listForUser,
  getWithTimeline,
  createManualApplication,
  updateManualApplication,
  updateStatus,
  deleteApplication,
  dismissEvent,
  addMilestone,
  getStats,
};
