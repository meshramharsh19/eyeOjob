// ai-providers.repository.js — verifies the SQL shape for the operations
// that matter most for correctness/security: the bulk priority reorder
// (must be one atomic statement, not a race-prone loop), user-scoped
// mutations (IDOR protection at the query level), and monthly-usage upsert
// semantics. Same style as syncLifecycleRepository.test.js — mock the pool,
// assert on the SQL string + params.

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
  escape: jest.fn((v) => (typeof v === 'number' ? String(v) : `'${v}'`)),
}));

const db = require('../src/config/database');
const repository = require('../src/modules/ai-providers/ai-providers.repository');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getConnectedProviders', () => {
  test('only selects CONNECTED rows, ordered by priority, scoped to user_id', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await repository.getConnectedProviders(7);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("status = 'CONNECTED'");
    expect(sql).toContain('ORDER BY priority ASC');
    expect(sql).toContain('WHERE user_id = ?');
    expect(params).toEqual([7]);
  });

  test('includes encrypted_credential (internal use only — never call this to build an HTTP response)', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await repository.getConnectedProviders(7);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('encrypted_credential');
  });
});

describe('listForUser (public/API-facing)', () => {
  test('never selects encrypted_credential', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await repository.listForUser(7);
    const [sql] = db.query.mock.calls[0];
    expect(sql).not.toContain('encrypted_credential');
  });
});

describe('reorder — bulk priority update (Section 6, API contract)', () => {
  test('builds a single CASE WHEN statement, scoped to user_id AND id IN (...)', async () => {
    db.query.mockResolvedValueOnce([{}]);
    await repository.reorder(7, [3, 1, 5]);

    expect(db.query).toHaveBeenCalledTimes(1); // one atomic statement, not a loop
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('CASE id');
    expect(sql).toContain('WHEN 3 THEN 0');
    expect(sql).toContain('WHEN 1 THEN 1');
    expect(sql).toContain('WHEN 5 THEN 2');
    expect(sql).toContain('WHERE user_id = ? AND id IN (?,?,?)');
    expect(params).toEqual([7, 3, 1, 5]);
  });

  test('a no-op for an empty list does not touch the DB', async () => {
    await repository.reorder(7, []);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('IDOR protection — every mutation is scoped by user_id, not just id', () => {
  test('updateModel', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await repository.updateModel(3, 7, 'new-model');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('WHERE id = ? AND user_id = ?');
    expect(params).toEqual(['new-model', 3, 7]);
  });

  test('remove (disconnect)', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await repository.remove(3, 7);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('WHERE id = ? AND user_id = ?');
    expect(params).toEqual([3, 7]);
  });

  test('getById', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await repository.getById(3, 7);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('WHERE id = ? AND user_id = ?');
    expect(params).toEqual([3, 7]);
  });
});

describe('upsertConnected — reconnect keeps priority slot', () => {
  test('uses ON DUPLICATE KEY UPDATE keyed on (user_id, provider), not a delete+insert', async () => {
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ id: 1, provider: 'groq', model: 'm', priority: 0, status: 'CONNECTED' }]]);

    await repository.upsertConnected({
      userId: 7, provider: 'groq', encryptedCredential: 'enc', model: 'm', priority: 0,
    });

    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
    expect(sql).toContain("status = 'CONNECTED'");
  });
});

describe('user_ai_monthly_usage — upsert semantics', () => {
  test('getOrCreateMonthlyUsage inserts a zero row only if none exists yet (does not clobber existing calls_used)', async () => {
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ calls_used: 42, quota_notified: 0 }]]);

    const usage = await repository.getOrCreateMonthlyUsage(7, '2026-09');

    const [insertSql, insertParams] = db.query.mock.calls[0];
    expect(insertSql).toContain('ON DUPLICATE KEY UPDATE user_id = user_id'); // no-op update — never resets calls_used
    expect(insertParams).toEqual([7, '2026-09']);
    expect(usage.calls_used).toBe(42);
  });

  test('incrementMonthlyUsage is atomic (single INSERT ... ON DUPLICATE KEY UPDATE calls_used = calls_used + 1)', async () => {
    db.query.mockResolvedValueOnce([{}]);
    await repository.incrementMonthlyUsage(7, '2026-09');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('calls_used = calls_used + 1');
    expect(params).toEqual([7, '2026-09']); // the literal 1 is inline in VALUES(?, ?, 1), not a bound param
  });
});

describe('getSubscription — lazy free-plan default', () => {
  test('returns the existing row when present, without inserting', async () => {
    db.query.mockResolvedValueOnce([[{ user_id: 7, plan: 'pro', has_managed_ai: 1, monthly_call_cap: null }]]);

    const sub = await repository.getSubscription(7);

    expect(sub.plan).toBe('pro');
    expect(db.query).toHaveBeenCalledTimes(1); // no extra INSERT when a row already exists
  });

  test('lazily creates a free-plan row when none exists (e.g. user predates the migration backfill)', async () => {
    db.query.mockResolvedValueOnce([[]]); // no row
    db.query.mockResolvedValueOnce([{}]); // INSERT IGNORE

    const sub = await repository.getSubscription(7);

    expect(sub).toEqual({ user_id: 7, plan: 'free', has_managed_ai: 0, monthly_call_cap: null });
    const [insertSql] = db.query.mock.calls[1];
    expect(insertSql).toContain('INSERT IGNORE INTO subscriptions');
  });
});
