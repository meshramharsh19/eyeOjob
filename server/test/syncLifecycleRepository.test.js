// Unit tests for the sync-lifecycle repository functions (startSync /
// completeSyncSuccess / completeSyncFailure), with the DB pool mocked so
// these run without a live MySQL connection.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const db = require('../src/config/database');
const repository = require('../src/pipelines/email-pipeline/pipeline.repository');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('startSync — concurrency guard + stuck-sync reclaim', () => {
  test('claims the row when the UPDATE matches (not currently syncing, or stale)', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const claimed = await repository.startSync(9, 15);

    expect(claimed).toBe(true);
    expect(db.query).toHaveBeenCalledTimes(1); // no fallback INSERT needed
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'syncing'"),
      [9, 15]
    );
  });

  test('inserts a fresh row when none exists yet for this user (first-ever sync)', async () => {
    db.query
      .mockResolvedValueOnce([{ affectedRows: 0 }]) // UPDATE matches nothing
      .mockResolvedValueOnce([{}]); // INSERT succeeds

    const claimed = await repository.startSync(9, 15);

    expect(claimed).toBe(true);
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO sync_status'),
      [9]
    );
  });

  test('refuses the claim when a genuinely in-progress sync already owns the row', async () => {
    const dupError = Object.assign(new Error('Duplicate entry'), { code: 'ER_DUP_ENTRY' });
    db.query
      .mockResolvedValueOnce([{ affectedRows: 0 }]) // UPDATE doesn't match — really syncing, not stale
      .mockRejectedValueOnce(dupError); // INSERT collides with the existing row

    const claimed = await repository.startSync(9, 15);

    expect(claimed).toBe(false);
  });

  test('propagates a genuinely unexpected DB error rather than swallowing it', async () => {
    const dbError = new Error('connection lost');
    db.query
      .mockResolvedValueOnce([{ affectedRows: 0 }])
      .mockRejectedValueOnce(dbError);

    await expect(repository.startSync(9, 15)).rejects.toThrow('connection lost');
  });
});

describe('completeSyncSuccess', () => {
  test('sets status=success and updates last_sync_at, clearing any prior error', async () => {
    db.query.mockResolvedValueOnce([{}]);

    await repository.completeSyncSuccess(9, 'history-123', 42);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'success'"),
      ['history-123', 42, 9]
    );
  });
});

describe('completeSyncFailure', () => {
  test('sets status=failed with the sanitized code/message, and does not touch last_sync_at', async () => {
    db.query.mockResolvedValueOnce([{}]);

    await repository.completeSyncFailure(9, 'GMAIL_AUTH_EXPIRED', 'Google authentication has expired. Please reconnect your Gmail account.');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("status = 'failed'");
    expect(sql).not.toContain('last_sync_at ='); // must not overwrite the last successful sync time
    expect(params).toEqual(['GMAIL_AUTH_EXPIRED', 'Google authentication has expired. Please reconnect your Gmail account.', 9]);
  });
});

describe('completeSyncNeedsReconnect', () => {
  test('sets status=needs_reconnect with the sanitized code/message', async () => {
    db.query.mockResolvedValueOnce([{}]);

    await repository.completeSyncNeedsReconnect(9, 'GMAIL_AUTH_EXPIRED', 'Google authentication has expired. Please reconnect your Gmail account.');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("status = 'needs_reconnect'");
    expect(params).toEqual(['GMAIL_AUTH_EXPIRED', 'Google authentication has expired. Please reconnect your Gmail account.', 9]);
  });
});

describe('getSchedulerEligibleUserIds', () => {
  test('excludes stopped and needs_reconnect, and excludes a non-stale syncing row, from the query', async () => {
    db.query.mockResolvedValueOnce([[{ id: 1 }, { id: 3 }]]);

    const ids = await repository.getSchedulerEligibleUserIds(15);

    expect(ids).toEqual([1, 3]);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("NOT IN ('stopped', 'needs_reconnect')");
    expect(sql).toContain("s.status != 'syncing'");
    expect(params).toEqual([15]);
  });

  test('returns an empty array when no users are eligible', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const ids = await repository.getSchedulerEligibleUserIds(15);
    expect(ids).toEqual([]);
  });
});
