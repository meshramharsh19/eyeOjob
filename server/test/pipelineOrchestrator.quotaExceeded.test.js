// Verifies the BYOK hybrid AI quota-exceeded path through the real
// pipeline.orchestrator.js (Project DOCs/BYOK.md, Section 3.4/6.4):
//   - a QuotaExceededError thrown by aiGateway.extract() for a specific
//     email tags that email 'needs_quota' (not 'extraction_failed') and
//     lets the sync continue, rather than aborting it
//   - a sync containing at least one such email concludes as
//     needs_upgrade_or_key (not success), and fires the debounced
//     notification exactly once
//   - any other error out of aiGateway.extract() is NOT swallowed — it
//     propagates like a normal extraction failure would
//
// Same mocking strategy as pipelineOrchestrator.needsReconnect.test.js —
// DB, Gmail client, and the AI gateway are all mocked; classification/ATS
// lookup are mocked to force every message down the "needs AI" path
// (step 3b) deterministically.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/pipelines/email-pipeline/pipeline.repository');
jest.mock('../src/pipelines/email-pipeline/ingestion/gmailClient');
jest.mock('../src/pipelines/email-pipeline/ingestion/historyFetcher');
jest.mock('../src/pipelines/email-pipeline/classification/classifier.service');
jest.mock('../src/pipelines/email-pipeline/extraction/ats.registry');
jest.mock('../src/modules/ai-providers/ai-providers.gateway');

const repository = require('../src/pipelines/email-pipeline/pipeline.repository');
const { getGmailClient, extractEmailParts } = require('../src/pipelines/email-pipeline/ingestion/gmailClient');
const { fetchMessageIdsFull } = require('../src/pipelines/email-pipeline/ingestion/historyFetcher');
const { classifyEmail, isJobPlatformDomain } = require('../src/pipelines/email-pipeline/classification/classifier.service');
const { getVendor } = require('../src/pipelines/email-pipeline/extraction/ats.registry');
const aiGateway = require('../src/modules/ai-providers/ai-providers.gateway');
const { QuotaExceededError } = require('../src/modules/ai-providers/errors/ai.errors');
const { syncUserEmails, processEmail } = require('../src/pipelines/email-pipeline/pipeline.orchestrator');
const { createSyncStats } = require('../src/pipelines/email-pipeline/pipeline.stats');

const USER_ID = 42;

const fakeGmailMessage = (id) => ({
  data: {
    threadId: `thread_${id}`,
    internalDate: String(Date.now()),
    payload: {},
  },
});

const fakeGmail = () => ({
  users: {
    messages: { get: jest.fn().mockImplementation(({ id }) => Promise.resolve(fakeGmailMessage(id))) },
    getProfile: jest.fn().mockResolvedValue({ data: { historyId: '999' } }),
  },
});

beforeEach(() => {
  jest.clearAllMocks();

  getGmailClient.mockImplementation(() => fakeGmail());
  extractEmailParts.mockReturnValue({
    body: 'We received your application for Software Engineer at Acme.',
    html: '<p>body</p>',
    headers: {
      subject: 'Your application to Acme',
      from: 'careers@acme.com',
      'message-id': '<m1@acme.com>',
      'in-reply-to': '',
      references: '',
      'reply-to': '',
    },
  });
  classifyEmail.mockReturnValue({ isJobRelated: true, classification: 'application_confirmation', confidence: 80, flags: [] });
  isJobPlatformDomain.mockReturnValue(false);
  getVendor.mockReturnValue(null); // no ATS parser match — always falls through to AI extraction

  repository.startSync.mockResolvedValue(true);
  repository.getGmailCredentials.mockResolvedValue({ gmail_token: 't', refresh_token: 'r' });
  repository.getLastHistoryId.mockResolvedValue(null);
  repository.findExistingProcessedEmail.mockResolvedValue([]);
  repository.insertProcessedEmail.mockResolvedValue(501);
  repository.updateProcessedEmailClassification.mockResolvedValue(undefined);
  repository.completeSyncNeedsUpgradeOrKey.mockResolvedValue(undefined);
  repository.completeSyncSuccess.mockResolvedValue(undefined);

  aiGateway.currentUtcYearMonth.mockReturnValue('2026-09');
  aiGateway.notifyQuotaOnce.mockResolvedValue(undefined);

  fetchMessageIdsFull.mockResolvedValue(['msg1']);
});

describe('processEmail — QuotaExceededError branch', () => {
  test('tags the email needs_quota (not extraction_failed) and returns null without throwing', async () => {
    aiGateway.extract.mockRejectedValue(new QuotaExceededError({ userId: USER_ID, cap: 150, used: 150 }));

    const stats = createSyncStats();
    const gmail = fakeGmail();
    const result = await processEmail(gmail, USER_ID, 'msg1', stats, new Map(), false);

    expect(result).toBeNull();
    expect(stats.quotaExceeded).toBe(true);
    expect(stats.dropStage.needs_quota).toBe(1);
    expect(repository.updateProcessedEmailClassification).toHaveBeenCalledWith(501, 'needs_quota', 80);
  });

  test('any other error out of aiGateway.extract still propagates (not swallowed as quota)', async () => {
    aiGateway.extract.mockRejectedValue(new Error('provider exploded'));

    const stats = createSyncStats();
    const gmail = fakeGmail();

    await expect(processEmail(gmail, USER_ID, 'msg1', stats, new Map(), false)).rejects.toThrow('provider exploded');
    expect(stats.quotaExceeded).toBeUndefined();
  });
});

describe('syncUserEmails — quota-exceeded sync conclusion', () => {
  test('a sync with a quota-blocked email completes as needs_upgrade_or_key, not success, and notifies once', async () => {
    aiGateway.extract.mockRejectedValue(new QuotaExceededError({ userId: USER_ID, cap: 150, used: 150 }));

    const result = await syncUserEmails(USER_ID);

    expect(result.needsUpgradeOrKey).toBe(true);
    expect(repository.completeSyncSuccess).toHaveBeenCalled(); // history_id still advances
    expect(repository.completeSyncNeedsUpgradeOrKey).toHaveBeenCalledWith(USER_ID, 0);
    expect(aiGateway.notifyQuotaOnce).toHaveBeenCalledWith(USER_ID, '2026-09');
  });

  test('a sync with no quota issues completes as plain success, no needs_upgrade_or_key call', async () => {
    // Non-lifecycle intent ('other') routes through the ai_reject branch and
    // returns early, deliberately avoiding the application-matching path
    // (matchApplication, insertApplication, etc — real, unmocked modules)
    // since this test only cares about the quota-conclusion branch, not
    // full application creation.
    aiGateway.extract.mockResolvedValue({
      intent: 'other', company: null, role: null, status: null,
      confidence: 10, is_job_email: false, extractionFailed: false,
    });

    const result = await syncUserEmails(USER_ID);

    expect(result.needsUpgradeOrKey).toBeUndefined();
    expect(repository.completeSyncNeedsUpgradeOrKey).not.toHaveBeenCalled();
    expect(aiGateway.notifyQuotaOnce).not.toHaveBeenCalled();
  });
});
