// Application Journey Pipeline — key-scenario verification (Reaad.md-style
// spec). Mocks the DB layer the same way notifications.test.js does, so
// these run without a real database while still exercising the actual
// repository/orchestrator/taxonomy code paths.

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
}));

const db = require('../src/config/database');
const pipelineRepository = require('../src/pipelines/email-pipeline/pipeline.repository');
const {
  EVENT_TYPES, mapEventTypeToStatus, mapStatusStringToEventType,
} = require('../src/pipelines/email-pipeline/eventTaxonomy');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('eventTaxonomy', () => {
  test('every granular event type maps to a valid coarse status', () => {
    const validStatuses = new Set([
      'Applied', 'OA', 'Interview', 'HR Round', 'Final Round', 'Offer', 'Rejected', 'Withdrawn',
    ]);
    Object.values(EVENT_TYPES).forEach((eventType) => {
      const status = mapEventTypeToStatus(eventType);
      if (status !== null) {
        expect(validStatuses.has(status)).toBe(true);
      }
    });
  });

  test('coarse status strings map to a sensible granular fallback event', () => {
    expect(mapStatusStringToEventType('Interview')).toBe('INTERVIEW_INVITED');
    expect(mapStatusStringToEventType('Rejected')).toBe('REJECTED');
    expect(mapStatusStringToEventType('Unknown Status')).toBeNull();
  });
});

describe('pipeline.repository.insertTimelineEvent (Phase 5 + dedupe)', () => {
  test('writes granular event with email_received_at/confidence/metadata', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1, affectedRows: 1 }]);

    const result = await pipelineRepository.insertTimelineEvent({
      applicationId: 5,
      eventType: EVENT_TYPES.INTERVIEW_SCHEDULED,
      eventDate: new Date('2026-09-20T10:00:00Z'),
      description: 'Interview scheduled',
      emailMsgId: 'msg_1',
      emailReceivedAt: new Date('2026-09-18T08:00:00Z'),
      confidence: 92,
      metadata: { source: 'ai', round: 1 },
      appliedStatus: 'Interview',
    });

    expect(result).toEqual({ insertId: 1, wasInserted: true });
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('INSERT IGNORE INTO timeline_events');
    expect(sql).toContain('email_received_at');
    expect(sql).toContain('confidence');
    expect(sql).toContain('metadata');
    expect(sql).toContain('applied_status');
    expect(params).toEqual([
      5, EVENT_TYPES.INTERVIEW_SCHEDULED, expect.any(Date), 'Interview scheduled', 'msg_1',
      null, null, expect.any(Date), 92, JSON.stringify({ source: 'ai', round: 1 }), 'Interview',
    ]);
  });

  test('stays backward compatible when called with only the original fields', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 2, affectedRows: 1 }]);

    await pipelineRepository.insertTimelineEvent({
      applicationId: 5,
      eventType: 'applied',
      eventDate: new Date(),
      description: 'legacy caller',
      emailMsgId: 'msg_2',
    });

    const [, params] = db.query.mock.calls[0];
    expect(params[7]).toBeNull(); // emailReceivedAt
    expect(params[8]).toBeNull(); // confidence
    expect(params[9]).toBeNull(); // metadata
    expect(params[10]).toBeNull(); // appliedStatus
  });

  // Duplicate email processed twice must produce exactly one event: the
  // unique key (email_msg_id, event_type, event_date) makes the second
  // INSERT IGNORE a no-op (affectedRows 0), and the repository surfaces
  // that as wasInserted: false so the orchestrator knows not to notify again.
  test('reprocessing the same email+event+date is reported as not-inserted (idempotent)', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 0, affectedRows: 0 }]);

    const result = await pipelineRepository.insertTimelineEvent({
      applicationId: 5,
      eventType: EVENT_TYPES.APPLICATION_RECEIVED,
      eventDate: new Date('2026-09-18T00:00:00Z'),
      description: 'dup',
      emailMsgId: 'msg_dup',
    });

    expect(result.wasInserted).toBe(false);
  });

  // Legitimate repeats (interview rescheduled) use the SAME event_type but a
  // DIFFERENT event_date (or a different email_msg_id) — these must be
  // allowed, not deduped away, since the unique key includes event_date.
  test('a rescheduled interview (same type, different date) is a distinct row, not a dedupe', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 3, affectedRows: 1 }]);
    const first = await pipelineRepository.insertTimelineEvent({
      applicationId: 5,
      eventType: EVENT_TYPES.INTERVIEW_SCHEDULED,
      eventDate: new Date('2026-09-20'),
      description: 'first slot',
      emailMsgId: 'msg_a',
    });

    db.query.mockResolvedValueOnce([{ insertId: 4, affectedRows: 1 }]);
    const rescheduled = await pipelineRepository.insertTimelineEvent({
      applicationId: 5,
      eventType: EVENT_TYPES.INTERVIEW_SCHEDULED,
      eventDate: new Date('2026-09-25'),
      description: 'rescheduled slot',
      emailMsgId: 'msg_b',
    });

    expect(first.wasInserted).toBe(true);
    expect(rescheduled.wasInserted).toBe(true);
  });
});
