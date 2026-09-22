// AI Correction Feedback Loop (Project DOCs/ai-feedback-loop.md) — repository
// layer. Verifies the exact SQL shape each query relies on: applied_status
// exact-match (not timestamp ordering) for status-correction attribution,
// creation-email ordering for entity corrections, and the bounded/scoped
// few-shot query.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const db = require('../src/config/database');
const repository = require('../src/modules/ai-feedback/aiFeedback.repository');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('findStatusCorrectionCulprit', () => {
  test('queries on applied_status exact match, not timestamp ordering', async () => {
    db.query.mockResolvedValueOnce([[{ email_msg_id: 'm1', processed_email_id: 9, sender_domain: 'acme.com', subject: 'Update', classification: 'rejection', confidence: 80 }]]);

    const result = await repository.findStatusCorrectionCulprit(5, 1, 'Rejected');

    expect(result.processed_email_id).toBe(9);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('te.applied_status = ?');
    expect(sql).not.toMatch(/ORDER BY.*received_at/i); // never timestamp-based
    expect(sql).toContain('pe.user_id = ?'); // scoped, can't cross into another user's email
    expect(params).toEqual([1, 5, 'Rejected']);
  });

  test('returns null when no timeline row has that applied_status (legacy data)', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const result = await repository.findStatusCorrectionCulprit(5, 1, 'Rejected');
    expect(result).toBeNull();
  });
});

describe('findCreationEmail', () => {
  test('orders by received_at ASC (the first/creation email, not the latest)', async () => {
    db.query.mockResolvedValueOnce([[{ processed_email_id: 1, sender_domain: 'acme.com', subject: 'Applied', classification: 'application_confirmation', confidence: 90 }]]);

    await repository.findCreationEmail(5, 1);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY received_at ASC/i);
    expect(sql).toContain('LIMIT 1');
    expect(params).toEqual([5, 1]);
  });
});

describe('insertFeedback', () => {
  test('inserts all fields into ai_correction_feedback', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 42 }]);

    const id = await repository.insertFeedback({
      userId: 1, applicationId: 5, processedEmailId: 9, fieldCorrected: 'status',
      aiPredictedValue: 'Rejected', userCorrectedValue: 'Offer',
      senderDomain: 'acme.com', emailSubject: 'Update', aiClassification: 'rejection', aiConfidence: 80,
    });

    expect(id).toBe(42);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO ai_correction_feedback');
    expect(params).toEqual([1, 5, 9, 'status', 'Rejected', 'Offer', 'acme.com', 'Update', 'rejection', 80]);
  });
});

describe('findFewShotCorrections', () => {
  test('scopes to user_id, sender_domain, and field_corrected IN (status, false_positive), capped at limit', async () => {
    db.query.mockResolvedValueOnce([[]]);

    await repository.findFewShotCorrections(1, 'acme.com', 2);

    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain("field_corrected IN ('status', 'false_positive')");
    expect(sql).not.toContain("'company'"); // company/role corrections never feed the prompt — aliases only
    expect(params).toEqual([1, 'acme.com', 2]);
  });

  test('short-circuits with no query when senderDomain is missing', async () => {
    const rows = await repository.findFewShotCorrections(1, null, 2);
    expect(rows).toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('findCorrectionClusters', () => {
  test('groups by domain/field/values with a minimum frequency threshold', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await repository.findCorrectionClusters(3);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('HAVING frequency >= ?');
    expect(params).toEqual([3]);
  });
});
