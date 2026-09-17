jest.mock('../src/config/database', () => ({
  query: jest.fn(),
}));

const db = require('../src/config/database');
const notificationsService = require('../src/modules/notifications/notifications.service');
const notificationsRepository = require('../src/modules/notifications/notifications.repository');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Notifications Module', () => {
  describe('notifications.service', () => {
    test('suppresses notification when isInitialSync is true', async () => {
      const result = await notificationsService.notifyStatusEvent({
        applicationId: 10,
        userId: 1,
        status: 'Interview',
        company: 'Google',
        role: 'SWE',
        emailMsgId: 'msg_1',
        isInitialSync: true,
      });

      expect(result).toBeNull();
      expect(db.query).not.toHaveBeenCalled();
    });

    test('suppresses notification for non-notifiable statuses (Applied, Withdrawn)', async () => {
      const appliedResult = await notificationsService.notifyStatusEvent({
        applicationId: 10,
        userId: 1,
        status: 'Applied',
        company: 'Google',
        role: 'SWE',
        emailMsgId: 'msg_2',
        isInitialSync: false,
      });

      const withdrawnResult = await notificationsService.notifyStatusEvent({
        applicationId: 10,
        userId: 1,
        status: 'Withdrawn',
        company: 'Google',
        role: 'SWE',
        emailMsgId: 'msg_3',
        isInitialSync: false,
      });

      expect(appliedResult).toBeNull();
      expect(withdrawnResult).toBeNull();
      expect(db.query).not.toHaveBeenCalled();
    });

    test('creates notification with correct mapping for notifiable statuses', async () => {
      db.query.mockResolvedValueOnce([{ insertId: 42 }]);

      const result = await notificationsService.notifyStatusEvent({
        applicationId: 10,
        userId: 1,
        status: 'Interview',
        company: 'Google',
        role: 'Software Engineer',
        emailMsgId: 'msg_interview_1',
        isInitialSync: false,
      });

      expect(result).toBe(42);
      expect(db.query).toHaveBeenCalledTimes(1);

      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('INSERT IGNORE INTO notifications');
      expect(params).toEqual([
        1,
        10,
        'msg_interview_1',
        'interview',
        'success',
        'Interview Invitation',
        'Google — Software Engineer',
      ]);
    });

    test('handles "Not specified" in body cleanly', async () => {
      db.query.mockResolvedValueOnce([{ insertId: 43 }]);

      await notificationsService.notifyStatusEvent({
        applicationId: 11,
        userId: 1,
        status: 'OA',
        company: 'Amazon',
        role: 'Not specified',
        emailMsgId: 'msg_oa_1',
        isInitialSync: false,
      });

      const [, params] = db.query.mock.calls[0];
      expect(params[5]).toBe('Assessment Received');
      expect(params[6]).toBe('Amazon');
    });

    test('catches DB errors gracefully without throwing', async () => {
      db.query.mockRejectedValueOnce(new Error('DB connection refused'));

      const result = await notificationsService.notifyStatusEvent({
        applicationId: 12,
        userId: 1,
        status: 'Offer',
        company: 'Netflix',
        role: 'Staff Engineer',
        emailMsgId: 'msg_offer_1',
        isInitialSync: false,
      });

      expect(result).toBeNull();
    });
  });

  describe('notifications.repository', () => {
    test('findByUser clamps pagination and queries scoped by user_id', async () => {
      db.query.mockResolvedValueOnce([[]]);

      await notificationsRepository.findByUser(5, { limit: -10, offset: -5 });

      expect(db.query).toHaveBeenCalledTimes(1);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('WHERE user_id = ?');
      expect(sql).toContain('ORDER BY is_read ASC, created_at DESC');
      expect(params).toEqual([5, 1, 0]); // clamped to min limit 1, offset 0
    });

    test('getUnreadCount filters by user_id and is_read = 0', async () => {
      db.query.mockResolvedValueOnce([[{ count: 4 }]]);

      const count = await notificationsRepository.getUnreadCount(7);

      expect(count).toBe(4);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('WHERE user_id = ? AND is_read = 0');
      expect(params).toEqual([7]);
    });

    test('markRead enforces user_id ownership in WHERE clause', async () => {
      db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

      const updated = await notificationsRepository.markRead(99, 3);

      expect(updated).toBe(true);
      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('WHERE id = ? AND user_id = ?');
      expect(params).toEqual([99, 3]);
    });

    test('markAllRead updates only unread notifications for the user', async () => {
      db.query.mockResolvedValueOnce([{ affectedRows: 3 }]);

      await notificationsRepository.markAllRead(3);

      const [sql, params] = db.query.mock.calls[0];
      expect(sql).toContain('WHERE user_id = ? AND is_read = 0');
      expect(params).toEqual([3]);
    });
  });
});
