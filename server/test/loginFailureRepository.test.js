// Unit tests for the login-failure repository's window/reset logic, with the
// DB pool mocked so these run without a live MySQL connection.

jest.mock('../src/config/database', () => ({ query: jest.fn() }));

const db = require('../src/config/database');
const loginFailureRepository = require('../src/modules/auth/login-failure.repository');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('login-failure.repository', () => {
  test('find() normalizes the email (trim + lowercase) before querying', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await loginFailureRepository.find('  User@Example.com  ');
    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['user@example.com']);
  });

  test('recordFailure() starts a fresh counter at 1 when no row exists yet', async () => {
    db.query
      .mockResolvedValueOnce([[]]) // find() → no existing row
      .mockResolvedValueOnce([{}]); // the INSERT ... ON DUPLICATE KEY UPDATE

    const count = await loginFailureRepository.recordFailure('user@example.com', 15 * 60 * 1000);

    expect(count).toBe(1);
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO login_failures'),
      expect.arrayContaining(['user@example.com', expect.any(Date)])
    );
  });

  test('recordFailure() increments an existing counter within the window', async () => {
    db.query
      .mockResolvedValueOnce([[{ email: 'user@example.com', failed_count: 2, first_failed_at: new Date() }]])
      .mockResolvedValueOnce([{}]); // the UPDATE

    const count = await loginFailureRepository.recordFailure('user@example.com', 15 * 60 * 1000);

    expect(count).toBe(3);
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE login_failures SET failed_count = failed_count + 1'),
      ['user@example.com']
    );
  });

  test('recordFailure() restarts the counter at 1 once the window has expired', async () => {
    const staleFirstFailure = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    db.query
      .mockResolvedValueOnce([[{ email: 'user@example.com', failed_count: 4, first_failed_at: staleFirstFailure }]])
      .mockResolvedValueOnce([{}]); // the INSERT ... ON DUPLICATE KEY UPDATE (reset path)

    const count = await loginFailureRepository.recordFailure('user@example.com', 15 * 60 * 1000);

    expect(count).toBe(1);
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO login_failures'),
      expect.arrayContaining(['user@example.com'])
    );
  });

  test('reset() deletes the row for the normalized email', async () => {
    db.query.mockResolvedValueOnce([{}]);
    await loginFailureRepository.reset('User@Example.com');
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM login_failures'), ['user@example.com']);
  });
});
