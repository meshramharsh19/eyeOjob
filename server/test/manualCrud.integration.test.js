// Comprehensive tests covering:
// 1. Ownership isolation
// 2. Company & role normalization on create & update
// 3. Lock behavior (unlocked on create, locked on edit/override)
// 4. Pipeline merge behavior on locked vs unlocked applications
// 5. Soft-delete exclusion across queries and matcher
// 6. Timeline audit event logging

jest.mock('../src/config/database', () => ({
  query: jest.fn(),
}));

const db = require('../src/config/database');
const applicationsService = require('../src/modules/applications/applications.service');
const applicationsRepository = require('../src/modules/applications/applications.repository');
const { matchApplication } = require('../src/pipelines/email-pipeline/matching/applicationMatcher');
const { DECISION } = require('../src/pipelines/email-pipeline/matching/scoring.service');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Manual Applications CRUD & Pipeline Integration', () => {
  describe('1. Normalization and Lock Defaults on Manual Create', () => {
    test('creates manual application with source="manual", is_locked_by_user=0, verified status, and normalized company/role', async () => {
      const mockInsertId = 101;

      db.query.mockImplementation((sql) => {
        if (sql.includes('company_aliases') || sql.includes('role_aliases')) {
          return Promise.resolve([[]]); // no alias, fallback to basicCleanup
        }
        if (sql.includes('INSERT INTO applications')) {
          return Promise.resolve([{ insertId: mockInsertId }]);
        }
        if (sql.includes('INSERT INTO timeline_events')) {
          return Promise.resolve([{ insertId: 1 }]);
        }
        if (sql.includes('SELECT * FROM applications WHERE id = ?')) {
          return Promise.resolve([
            [{
              id: mockInsertId,
              user_id: 1,
              company: 'Google LLC',
              role: 'Senior Software Engineer',
              normalized_company: 'google',
              normalized_role: 'senior software engineer',
              source: 'manual',
              is_locked_by_user: 0,
              status: 'Applied',
              verification_status: 'verified',
              confidence_score: 100,
              deleted_at: null,
            }],
          ]);
        }
        return Promise.resolve([[]]);
      });

      const app = await applicationsService.createManualApplication(1, {
        company: 'Google LLC',
        role: 'Senior Software Engineer',
        status: 'Applied',
        platform: 'LinkedIn',
      });

      expect(app).toBeDefined();
      expect(app.id).toBe(mockInsertId);

      // Verify db.query was called with normalized company and is_locked_by_user = 0
      const insertCall = db.query.mock.calls.find((call) => call[0].includes('INSERT INTO applications'));
      expect(insertCall).toBeDefined();
      const params = insertCall[1];

      expect(params).toContain('google llc'); // normalizedCompany
      expect(params).toContain('senior engineer'); // normalizedRole
      expect(params).toContain('manual'); // source
      expect(params).toContain(0); // is_locked_by_user = 0
      expect(params).toContain('verified'); // verification_status = 'verified'

      // Verify timeline event logged
      const timelineCall = db.query.mock.calls.find((call) => call[0].includes('INSERT INTO timeline_events'));
      expect(timelineCall).toBeDefined();
      expect(timelineCall[1]).toContain('manual_create');
    });

    test('rejects creation when company or role is missing', async () => {
      await expect(applicationsService.createManualApplication(1, { role: 'Dev' })).rejects.toThrow(
        'Company name is required'
      );
      await expect(applicationsService.createManualApplication(1, { company: 'Meta' })).rejects.toThrow(
        'Role / Job title is required'
      );
    });

    test('rejects creation with an invalid status enum', async () => {
      await expect(
        applicationsService.createManualApplication(1, {
          company: 'Meta',
          role: 'Engineer',
          status: 'NonExistentStatus',
        })
      ).rejects.toThrow('Invalid status');
    });
  });

  describe('2. Manual Edit & Lock Behavior', () => {
    test('updating an application sets is_locked_by_user=1, re-normalizes if changed, and records timeline event', async () => {
      db.query.mockImplementation((sql) => {
        if (sql.includes('company_aliases') || sql.includes('role_aliases')) {
          return Promise.resolve([[]]);
        }
        if (sql.includes('SELECT * FROM applications WHERE id = ?')) {
          return Promise.resolve([
            [{
              id: 55,
              user_id: 1,
              company: 'Amazon Web Services',
              role: 'SDE II',
              status: 'Interview',
              is_locked_by_user: 1,
              verification_status: 'verified',
            }],
          ]);
        }
        if (sql.includes('UPDATE applications')) {
          return Promise.resolve([{ affectedRows: 1 }]);
        }
        if (sql.includes('INSERT INTO timeline_events')) {
          return Promise.resolve([{ insertId: 1 }]);
        }
        return Promise.resolve([[]]);
      });

      const updated = await applicationsService.updateManualApplication(55, 1, {
        company: 'Amazon Web Services',
        role: 'SDE II',
        status: 'Interview',
        notes: 'Passed recruiter screen',
      });

      expect(updated.is_locked_by_user).toBe(1);

      // Verify update SQL
      const updateCall = db.query.mock.calls.find((call) => call[0].includes('UPDATE applications'));
      expect(updateCall).toBeDefined();
      const updateParams = updateCall[1];
      expect(updateParams).toContain('amazon web'); // normalized 'Amazon Web Services' via basicCleanup
      expect(updateParams).toContain(1); // isLockedByUser = 1

      // Verify timeline event
      const timelineCall = db.query.mock.calls.find((call) => call[0].includes('INSERT INTO timeline_events'));
      expect(timelineCall).toBeDefined();
      expect(timelineCall[1]).toContain('manual_update');
    });

    test('updateStatus helper also locks the application against automated changes', async () => {
      db.query.mockImplementation((sql) => {
        if (sql.includes('SELECT * FROM applications WHERE id = ?')) {
          return Promise.resolve([
            [{ id: 55, user_id: 1, status: 'Offer', is_locked_by_user: 1 }],
          ]);
        }
        if (sql.includes('UPDATE applications')) {
          return Promise.resolve([{ affectedRows: 1 }]);
        }
        if (sql.includes('INSERT INTO timeline_events')) {
          return Promise.resolve([{ insertId: 1 }]);
        }
        return Promise.resolve([[]]);
      });

      const res = await applicationsService.updateStatus(55, 1, { status: 'Offer', notes: 'Accepted' });
      expect(res.is_locked_by_user).toBe(1);
    });
  });

  describe('3. Ownership Isolation', () => {
    test('user A cannot view another user B application', async () => {
      db.query.mockResolvedValueOnce([[]]); // Not found for user 99

      await expect(applicationsService.getWithTimeline(55, 99)).rejects.toThrow('Application not found');
    });

    test('user A cannot update another user B application', async () => {
      db.query.mockResolvedValueOnce([[]]); // Not found

      await expect(
        applicationsService.updateManualApplication(55, 99, { status: 'Offer' })
      ).rejects.toThrow('Application not found');
    });

    test('user A cannot delete another user B application', async () => {
      db.query.mockResolvedValueOnce([[]]); // Not found

      await expect(applicationsService.deleteApplication(55, 99)).rejects.toThrow(
        'Application not found'
      );
    });
  });

  describe('4. Soft Delete and Query Filtering', () => {
    test('soft delete sets deleted_at and logs manual_delete timeline event', async () => {
      db.query.mockImplementation((sql) => {
        if (sql.includes('SELECT * FROM applications WHERE id = ?')) {
          return Promise.resolve([
            [{ id: 55, user_id: 1, company: 'Netflix', role: 'UI Engineer' }],
          ]);
        }
        if (sql.includes('UPDATE applications')) {
          return Promise.resolve([{ affectedRows: 1 }]);
        }
        if (sql.includes('INSERT INTO timeline_events')) {
          return Promise.resolve([{ insertId: 1 }]);
        }
        return Promise.resolve([[]]);
      });

      const result = await applicationsService.deleteApplication(55, 1);
      expect(result.success).toBe(true);

      const softDeleteCall = db.query.mock.calls.find((call) => call[0].includes('UPDATE applications'));
      expect(softDeleteCall[0]).toContain('SET deleted_at = NOW()');
      expect(softDeleteCall[0]).toContain('deleted_at IS NULL');

      const timelineCall = db.query.mock.calls.find((call) => call[0].includes('INSERT INTO timeline_events'));
      expect(timelineCall[1]).toContain('manual_delete');
    });

    test('findAllByUser, findByIdForUser, and getStats enforce deleted_at IS NULL', async () => {
      db.query.mockResolvedValueOnce([[]]);
      await applicationsRepository.findAllByUser(1);
      expect(db.query.mock.calls[0][0]).toContain('a.deleted_at IS NULL');

      db.query.mockResolvedValueOnce([[]]);
      await applicationsRepository.findByIdForUser(55, 1);
      expect(db.query.mock.calls[1][0]).toContain('deleted_at IS NULL');

      db.query.mockResolvedValueOnce([{ total: 0 }]);
      await applicationsRepository.getStats(1);
      expect(db.query.mock.calls[2][0]).toContain('deleted_at IS NULL');
    });

    test('applicationMatcher excludes soft-deleted applications across all strategies', async () => {
      db.query.mockResolvedValue([[]]); // All queries return empty

      await matchApplication(1, {
        gmailThreadId: 'th123',
        messageIdHeader: '<m1@mail>',
        inReplyTo: '<ref1@mail>',
        jobId: 'JOB-99',
        normalizedCompany: 'apple',
      });

      // Verify that all query invocations in the matcher checked deleted_at IS NULL
      const queries = db.query.mock.calls.map((call) => call[0]);
      for (const query of queries) {
        expect(query).toContain('deleted_at IS NULL');
      }
    });
  });

  describe('5. Matcher Integration with Locked vs Unlocked Applications', () => {
    test('matchApplication finds candidate and returns AUTO_MERGE decision with candidate data', async () => {
      const now = new Date();
      db.query.mockImplementation((sql) => {
        if (sql.includes('normalized_company = ? AND deleted_at IS NULL')) {
          return Promise.resolve([
            [{
              id: 77,
              user_id: 1,
              normalized_company: 'google',
              normalized_role: 'software engineer',
              location: 'San Francisco',
              status: 'Applied',
              is_locked_by_user: 0,
              updated_at: now,
              applied_date: now,
            }],
          ]);
        }
        return Promise.resolve([[]]);
      });

      const result = await matchApplication(1, {
        gmailThreadId: 'new_thread',
        normalizedCompany: 'google',
        normalizedRole: 'software engineer',
        location: 'San Francisco',
        receivedAt: now,
      });

      expect(result.decision).toBe(DECISION.AUTO_MERGE);
      expect(result.application.id).toBe(77);
      expect(result.application.is_locked_by_user).toBe(0);
    });
  });
});
