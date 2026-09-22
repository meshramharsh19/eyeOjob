// AI Correction Feedback Loop — service layer (attribution + recording +
// the alias side-effect). Repository and the alias upsert functions are
// mocked; this file verifies the DECISIONS aiFeedback.service.js makes, not
// the SQL underneath them (covered in aiFeedbackRepository.test.js).

// Automocking aiFeedback.repository still loads the real module once to
// derive its shape, which would pull in the real mysql2 pool from
// config/database unless that's stubbed first.
jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/modules/ai-feedback/aiFeedback.repository');
jest.mock('../src/pipelines/email-pipeline/matching/normalization.service', () => ({
  upsertCompanyAlias: jest.fn(),
  upsertRoleAlias: jest.fn(),
}));

const repository = require('../src/modules/ai-feedback/aiFeedback.repository');
const { upsertCompanyAlias, upsertRoleAlias } = require('../src/pipelines/email-pipeline/matching/normalization.service');
const aiFeedback = require('../src/modules/ai-feedback/aiFeedback.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('recordStatusCorrection', () => {
  test('records a feedback row when the applied_status culprit is found', async () => {
    repository.findStatusCorrectionCulprit.mockResolvedValue({
      email_msg_id: 'm1', processed_email_id: 9, sender_domain: 'acme.com',
      subject: 'Update on your application', classification: 'rejection', confidence: 80,
    });

    const recorded = await aiFeedback.recordStatusCorrection({
      userId: 1, applicationId: 5, existingStatus: 'Rejected', newStatus: 'Offer',
    });

    expect(recorded).toBe(true);
    expect(repository.insertFeedback).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1, applicationId: 5, processedEmailId: 9, fieldCorrected: 'status',
      aiPredictedValue: 'Rejected', userCorrectedValue: 'Offer', senderDomain: 'acme.com',
    }));
  });

  test('skips silently (no insert) when no timeline row matches the applied_status — never guesses', async () => {
    repository.findStatusCorrectionCulprit.mockResolvedValue(null);

    const recorded = await aiFeedback.recordStatusCorrection({
      userId: 1, applicationId: 5, existingStatus: 'Rejected', newStatus: 'Offer',
    });

    expect(recorded).toBe(false);
    expect(repository.insertFeedback).not.toHaveBeenCalled();
  });
});

describe('recordEntityCorrection', () => {
  test('records feedback AND writes a personal alias (Consumer 1) keyed on the OLD value', async () => {
    repository.findCreationEmail.mockResolvedValue({
      processed_email_id: 1, sender_domain: 'acme.com', subject: 'Applied', classification: 'application_confirmation', confidence: 90,
    });

    await aiFeedback.recordEntityCorrection({
      userId: 1, applicationId: 5, field: 'company',
      oldValue: 'LinkedIn', newValue: 'Zetheta Algorithms Pvt Ltd', newNormalizedValue: 'zetheta',
    });

    expect(repository.insertFeedback).toHaveBeenCalledWith(expect.objectContaining({
      fieldCorrected: 'company', aiPredictedValue: 'LinkedIn', userCorrectedValue: 'Zetheta Algorithms Pvt Ltd',
    }));
    expect(upsertCompanyAlias).toHaveBeenCalledWith(1, 'LinkedIn', 'zetheta');
    expect(upsertRoleAlias).not.toHaveBeenCalled();
  });

  test('routes role corrections to upsertRoleAlias, not upsertCompanyAlias', async () => {
    repository.findCreationEmail.mockResolvedValue(null);

    await aiFeedback.recordEntityCorrection({
      userId: 1, applicationId: 5, field: 'role',
      oldValue: 'SWE', newValue: 'Software Engineer II', newNormalizedValue: 'software engineer ii',
    });

    expect(upsertRoleAlias).toHaveBeenCalledWith(1, 'SWE', 'software engineer ii');
    expect(upsertCompanyAlias).not.toHaveBeenCalled();
  });

  test('still writes the alias even when no creation email can be found for attribution', async () => {
    repository.findCreationEmail.mockResolvedValue(null);

    const recorded = await aiFeedback.recordEntityCorrection({
      userId: 1, applicationId: 5, field: 'company',
      oldValue: 'LinkedIn', newValue: 'Acme', newNormalizedValue: 'acme',
    });

    expect(recorded).toBe(true);
    expect(repository.insertFeedback).not.toHaveBeenCalled(); // no email to attribute to
    expect(upsertCompanyAlias).toHaveBeenCalledWith(1, 'LinkedIn', 'acme'); // alias still useful on its own
  });

  test('does nothing when the value did not actually change', async () => {
    const recorded = await aiFeedback.recordEntityCorrection({
      userId: 1, applicationId: 5, field: 'company',
      oldValue: 'Acme', newValue: 'Acme', newNormalizedValue: 'acme',
    });

    expect(recorded).toBe(false);
    expect(repository.findCreationEmail).not.toHaveBeenCalled();
    expect(upsertCompanyAlias).not.toHaveBeenCalled();
  });
});

describe('recordFalsePositive', () => {
  test('attributes to the creation/seed email', async () => {
    repository.findCreationEmail.mockResolvedValue({
      processed_email_id: 1, sender_domain: 'spam.com', subject: 'Not a job', classification: 'other', confidence: 40,
    });

    const recorded = await aiFeedback.recordFalsePositive({ userId: 1, applicationId: 5, company: 'X', role: 'Y' });

    expect(recorded).toBe(true);
    expect(repository.insertFeedback).toHaveBeenCalledWith(expect.objectContaining({
      fieldCorrected: 'false_positive', userCorrectedValue: 'not_a_job', processedEmailId: 1,
    }));
  });

  test('skips when no seed email is found', async () => {
    repository.findCreationEmail.mockResolvedValue(null);
    const recorded = await aiFeedback.recordFalsePositive({ userId: 1, applicationId: 5 });
    expect(recorded).toBe(false);
    expect(repository.insertFeedback).not.toHaveBeenCalled();
  });
});

describe('getFewShotExamples', () => {
  test('maps repository rows into the prompt-ready shape', async () => {
    repository.findFewShotCorrections.mockResolvedValue([
      { field_corrected: 'status', ai_predicted_value: 'Rejected', user_corrected_value: 'Offer', email_subject: 'Update', email_snippet: 'We are pleased...' },
    ]);

    const examples = await aiFeedback.getFewShotExamples(1, 'acme.com');

    expect(examples).toEqual([
      { inputSnippet: 'We are pleased...', fieldCorrected: 'status', aiPredictedValue: 'Rejected', correctValue: 'Offer' },
    ]);
  });

  test('returns empty without querying when senderDomain is missing', async () => {
    const examples = await aiFeedback.getFewShotExamples(1, null);
    expect(examples).toEqual([]);
    expect(repository.findFewShotCorrections).not.toHaveBeenCalled();
  });
});
