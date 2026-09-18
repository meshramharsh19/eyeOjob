const { NotFoundError, BadRequestError, ConflictError } = require('../../errors');
const applicationsRepository = require('./applications.repository');
const { syncUserEmails, requestStop, forceStopStuckSync } = require('../../pipelines/email-pipeline');
const { normalizeCompany, normalizeRole } = require('../../pipelines/email-pipeline/matching/normalization.service');

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
]);

const triggerSync = async (userId) => syncUserEmails(userId);

const stopSync = async (userId) => {
  if (requestStop(userId)) return;

  const recovered = await forceStopStuckSync(userId);
  if (!recovered) throw new ConflictError('No sync is currently in progress.');
};

const STUCK_STATUS_THRESHOLD_DAYS = 14;
const TERMINAL_STATUSES = new Set(['Offer', 'Rejected', 'Withdrawn', 'Ghosted']);

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
// status. Silence is never inferred as Rejected/Withdrawn/Ghosted; this is
// purely "no status change in a while and the application is still open".
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
    normalizeCompany(company),
    normalizeRole(role),
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

  const updates = {};

  if (data.company !== undefined) {
    const trimmed = data.company?.trim();
    if (!trimmed) throw new BadRequestError('Company name cannot be empty.');
    updates.company = trimmed;
    updates.normalizedCompany = await normalizeCompany(trimmed);
  }

  if (data.role !== undefined) {
    const trimmed = data.role?.trim();
    if (!trimmed) throw new BadRequestError('Role cannot be empty.');
    updates.role = trimmed;
    updates.normalizedRole = await normalizeRole(trimmed);
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

const deleteApplication = async (id, userId) => {
  const existing = await applicationsRepository.findByIdForUser(id, userId);
  if (!existing) throw new NotFoundError('Application not found');

  await applicationsRepository.softDeleteApplication(id, userId);
  await applicationsRepository.addTimelineEvent(
    id,
    'manual_delete',
    `Application for ${existing.role} at ${existing.company} was removed by user.`
  );

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
