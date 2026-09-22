// AI Correction Feedback Loop — verifies applications.service.js's trigger
// decision (§2) actually gates the calls into aiFeedback.service correctly:
// eligible-vs-not, per-field independence, and non-fatal failure handling.
// aiFeedback.service itself (attribution/recording logic) is covered in
// aiFeedbackService.test.js — this file is purely about WHEN it gets called.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/modules/ai-feedback/aiFeedback.service');
jest.mock('../src/pipelines/email-pipeline', () => ({
  syncUserEmails: jest.fn(), requestStop: jest.fn(), forceStopStuckSync: jest.fn(),
}));

const db = require('../src/config/database');
const aiFeedbackService = require('../src/modules/ai-feedback/aiFeedback.service');
const applicationsService = require('../src/modules/applications/applications.service');

const emailSourcedUnlocked = {
  id: 55, user_id: 1, company: 'LinkedIn', role: 'SWE', status: 'Rejected',
  source: 'email', is_locked_by_user: 0, notes: null,
};

const emailSourcedLocked = { ...emailSourcedUnlocked, is_locked_by_user: 1 };
const manualSourced = { ...emailSourcedUnlocked, source: 'manual' };

const mockDbFor = (existing) => {
  db.query.mockImplementation((sql) => {
    if (sql.includes('company_aliases') || sql.includes('role_aliases')) return Promise.resolve([[]]);
    if (sql.includes('SELECT * FROM applications WHERE id = ?')) return Promise.resolve([[existing]]);
    if (sql.includes('UPDATE applications')) return Promise.resolve([{ affectedRows: 1 }]);
    if (sql.includes('INSERT INTO timeline_events')) return Promise.resolve([{ insertId: 1 }]);
    return Promise.resolve([[]]);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('updateManualApplication — correction-signal eligibility', () => {
  test('records a status correction on an unlocked, email-sourced application', async () => {
    mockDbFor(emailSourcedUnlocked);

    await applicationsService.updateManualApplication(55, 1, { status: 'Offer' });

    expect(aiFeedbackService.recordStatusCorrection).toHaveBeenCalledWith({
      userId: 1, applicationId: 55, existingStatus: 'Rejected', newStatus: 'Offer',
    });
  });

  test('does NOT record a signal for an already-locked application (second edit, not first disagreement)', async () => {
    mockDbFor(emailSourcedLocked);

    await applicationsService.updateManualApplication(55, 1, { status: 'Offer' });

    expect(aiFeedbackService.recordStatusCorrection).not.toHaveBeenCalled();
  });

  test('does NOT record a signal for a manually-created application (no AI baseline)', async () => {
    mockDbFor(manualSourced);

    await applicationsService.updateManualApplication(55, 1, { status: 'Offer' });

    expect(aiFeedbackService.recordStatusCorrection).not.toHaveBeenCalled();
  });

  test('does NOT record a signal when the status is set to the same value it already was', async () => {
    mockDbFor(emailSourcedUnlocked);

    await applicationsService.updateManualApplication(55, 1, { status: 'Rejected' });

    expect(aiFeedbackService.recordStatusCorrection).not.toHaveBeenCalled();
  });

  test('records company AND role corrections independently when both change in one edit', async () => {
    mockDbFor(emailSourcedUnlocked);

    await applicationsService.updateManualApplication(55, 1, { company: 'Zetheta Algorithms', role: 'Senior SWE' });

    expect(aiFeedbackService.recordEntityCorrection).toHaveBeenCalledWith(expect.objectContaining({ field: 'company', oldValue: 'LinkedIn', newValue: 'Zetheta Algorithms' }));
    expect(aiFeedbackService.recordEntityCorrection).toHaveBeenCalledWith(expect.objectContaining({ field: 'role', oldValue: 'SWE', newValue: 'Senior SWE' }));
    expect(aiFeedbackService.recordEntityCorrection).toHaveBeenCalledTimes(2);
  });

  test('a feedback-recording failure never breaks the underlying update — non-fatal', async () => {
    mockDbFor(emailSourcedUnlocked);
    aiFeedbackService.recordStatusCorrection.mockRejectedValue(new Error('feedback db down'));

    const result = await applicationsService.updateManualApplication(55, 1, { status: 'Offer' });

    expect(result).toBeDefined(); // update still completed and returned normally
  });
});

describe('deleteApplication — false_positive gating', () => {
  test('records false_positive when reason is not_a_job on an email-sourced application', async () => {
    mockDbFor(emailSourcedUnlocked);

    await applicationsService.deleteApplication(55, 1, { reason: 'not_a_job' });

    expect(aiFeedbackService.recordFalsePositive).toHaveBeenCalledWith({
      userId: 1, applicationId: 55, company: 'LinkedIn', role: 'SWE',
    });
  });

  test('does NOT record false_positive for other delete reasons', async () => {
    mockDbFor(emailSourcedUnlocked);

    await applicationsService.deleteApplication(55, 1, { reason: 'duplicate' });

    expect(aiFeedbackService.recordFalsePositive).not.toHaveBeenCalled();
  });

  test('does NOT record false_positive for a manually-created application, even with reason=not_a_job', async () => {
    mockDbFor(manualSourced);

    await applicationsService.deleteApplication(55, 1, { reason: 'not_a_job' });

    expect(aiFeedbackService.recordFalsePositive).not.toHaveBeenCalled();
  });

  test('does NOT record a signal when no reason is given at all', async () => {
    mockDbFor(emailSourcedUnlocked);

    await applicationsService.deleteApplication(55, 1, {});

    expect(aiFeedbackService.recordFalsePositive).not.toHaveBeenCalled();
  });

  test('rejects an unrecognized delete reason', async () => {
    await expect(applicationsService.deleteApplication(55, 1, { reason: 'bogus' })).rejects.toThrow('Invalid delete reason');
  });

  test('a feedback-recording failure never breaks the delete itself — non-fatal', async () => {
    mockDbFor(emailSourcedUnlocked);
    aiFeedbackService.recordFalsePositive.mockRejectedValue(new Error('feedback db down'));

    const result = await applicationsService.deleteApplication(55, 1, { reason: 'not_a_job' });

    expect(result.success).toBe(true);
  });
});
