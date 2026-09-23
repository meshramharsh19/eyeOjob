// Verifies syncUserEmails() routes a genuine Gmail auth failure to
// completeSyncNeedsReconnect (not completeSyncFailure), while every other
// failure kind (network, provider, unknown) stays completeSyncFailure —
// see pipeline.orchestrator.js's catch block and sync-error.mapper.js.
//
// All heavy dependencies (Gmail client, AI extractor, DB repository) are
// mocked; the interest here is purely which repository call the error path
// takes, not the pipeline's actual processing.

// Same reasoning as scheduler.test.js: automocking pipeline.repository
// still loads the real module once, which would open a live mysql2 pool
// via config/database unless that's stubbed out first.
jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/pipelines/email-pipeline/pipeline.repository');
jest.mock('../src/pipelines/email-pipeline/ingestion/gmailClient', () => ({
  getGmailClient: jest.fn(() => ({})),
  extractEmailParts: jest.fn(),
}));

const repository = require('../src/pipelines/email-pipeline/pipeline.repository');
const { syncUserEmails } = require('../src/pipelines/email-pipeline/pipeline.orchestrator');

beforeEach(() => {
  jest.clearAllMocks();
  repository.startSync.mockResolvedValue(true); // claim always succeeds — not what's under test here
});

describe('syncUserEmails — failure routing', () => {
  test('a revoked/expired refresh token (invalid_grant) sets needs_reconnect, not failed', async () => {
    repository.getGmailCredentials.mockRejectedValue(new Error('invalid_grant'));

    await expect(syncUserEmails(42)).rejects.toThrow();

    expect(repository.completeSyncNeedsReconnect).toHaveBeenCalledWith(
      42, 'GMAIL_AUTH_EXPIRED', expect.stringContaining('reconnect')
    );
    expect(repository.completeSyncFailure).not.toHaveBeenCalled();
  });

  test('a legacy plaintext token (fails decryption) sets needs_reconnect, not failed', async () => {
    repository.getGmailCredentials.mockRejectedValue(
      new Error('Malformed encrypted credential — expected iv:ciphertext:tag')
    );

    await expect(syncUserEmails(42)).rejects.toThrow();

    expect(repository.completeSyncNeedsReconnect).toHaveBeenCalledWith(
      42, 'GMAIL_AUTH_EXPIRED', expect.stringContaining('reconnect')
    );
    expect(repository.completeSyncFailure).not.toHaveBeenCalled();
  });

  test('a corrupted encrypted credential (auth-tag mismatch) sets needs_reconnect, not failed', async () => {
    repository.getGmailCredentials.mockRejectedValue(
      new Error('Unsupported state or unable to authenticate data')
    );

    await expect(syncUserEmails(42)).rejects.toThrow();

    expect(repository.completeSyncNeedsReconnect).toHaveBeenCalledWith(
      42, 'GMAIL_AUTH_EXPIRED', expect.stringContaining('reconnect')
    );
    expect(repository.completeSyncFailure).not.toHaveBeenCalled();
  });

  test('no Gmail connection at all sets needs_reconnect, not failed', async () => {
    repository.getGmailCredentials.mockResolvedValue(null); // no gmail_token on the user row

    await expect(syncUserEmails(42)).rejects.toThrow();

    expect(repository.completeSyncNeedsReconnect).toHaveBeenCalledWith(
      42, 'GMAIL_AUTH_EXPIRED', expect.any(String)
    );
    expect(repository.completeSyncFailure).not.toHaveBeenCalled();
  });

  test('a transient network error stays failed, not needs_reconnect', async () => {
    const netErr = new Error('connect ETIMEDOUT');
    netErr.code = 'ETIMEDOUT';
    repository.getGmailCredentials.mockRejectedValue(netErr);

    await expect(syncUserEmails(42)).rejects.toThrow();

    expect(repository.completeSyncFailure).toHaveBeenCalledWith(42, 'NETWORK_ERROR', expect.any(String));
    expect(repository.completeSyncNeedsReconnect).not.toHaveBeenCalled();
  });

  test('an unrecognized/AI-side error stays failed, not needs_reconnect', async () => {
    repository.getGmailCredentials.mockRejectedValue(new Error('some AI provider exploded'));

    await expect(syncUserEmails(42)).rejects.toThrow();

    expect(repository.completeSyncFailure).toHaveBeenCalledWith(42, 'UNKNOWN_ERROR', expect.any(String));
    expect(repository.completeSyncNeedsReconnect).not.toHaveBeenCalled();
  });
});
