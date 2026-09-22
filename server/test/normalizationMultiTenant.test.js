// AI Correction Feedback Loop (Project DOCs/ai-feedback-loop.md §3.2) —
// multi-tenant alias isolation. The critical property under test: one
// user's correction must be findable ONLY by that user (never leaking to
// another user's matching), while still falling back to the global (user_id
// = 0) seed set when no personal override exists.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const db = require('../src/config/database');
const { normalizeCompany, normalizeRole, upsertCompanyAlias, upsertRoleAlias } = require('../src/pipelines/email-pipeline/matching/normalization.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('normalizeCompany — scoped lookup', () => {
  test('queries user_id IN (callerUserId, 0), preferring the caller\'s own row', async () => {
    db.query.mockResolvedValueOnce([[{ canonical_name: 'google' }]]);

    const result = await normalizeCompany(42, 'Google LLC');

    expect(result).toBe('google');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('user_id IN (?, 0)');
    expect(sql).toContain('ORDER BY user_id DESC');
    expect(params).toEqual([42, 'Google LLC']);
  });

  test('falls back to basicCleanup when no alias row exists at all (neither personal nor global)', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const result = await normalizeCompany(42, 'Acme Technologies Pvt Ltd');
    expect(result).toBe('acme'); // legal-suffix cleanup, no alias needed
  });

  test('degrades to raw cleanup (never throws) if the alias table query fails', async () => {
    db.query.mockRejectedValueOnce(new Error('table missing'));
    const result = await normalizeCompany(42, 'Weird Co');
    expect(result).toBe('weird co');
  });
});

describe('normalizeRole — scoped lookup', () => {
  test('same IN (?, 0) / ORDER BY user_id DESC pattern as company', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await normalizeRole(7, 'Backend Dev');
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('user_id IN (?, 0)');
    expect(params).toEqual([7, 'Backend Dev']);
  });
});

describe('upsertCompanyAlias / upsertRoleAlias — Consumer 1 (personal, never global)', () => {
  test('always writes at the correcting user\'s own user_id, never 0', async () => {
    db.query.mockResolvedValueOnce([{}]);
    await upsertCompanyAlias(42, 'LinkedIn', 'zetheta');

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('ON DUPLICATE KEY UPDATE');
    expect(params).toEqual([42, 'LinkedIn', 'zetheta']);
    expect(params[0]).not.toBe(0); // never silently promotes to global
  });

  test('is a no-op when either value is missing (nothing meaningful to alias)', async () => {
    await upsertCompanyAlias(42, '', 'zetheta');
    await upsertRoleAlias(42, 'Old Title', '');
    expect(db.query).not.toHaveBeenCalled();
  });
});
