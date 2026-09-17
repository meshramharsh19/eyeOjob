// Tests for the scheduler's continuous worker pool (server/.../scheduler.js).
// Deliberately does NOT touch cron or the DB — runWorkerPool/runScheduledSync
// are exported specifically so this logic is testable in isolation.

// pipeline.repository is automocked below (jest still loads the real module
// once to derive its shape), which would otherwise pull in the real
// mysql2 pool from config/database and try to open a live connection —
// stub that out first, same as syncLifecycleRepository.test.js.
jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/pipelines/email-pipeline/pipeline.repository');
jest.mock('../src/pipelines/email-pipeline/pipeline.orchestrator', () => ({
  syncUserEmails: jest.fn(),
}));
jest.mock('../src/config/env', () => ({ scheduler: { concurrency: 3 } }));

const repository = require('../src/pipelines/email-pipeline/pipeline.repository');
const { syncUserEmails } = require('../src/pipelines/email-pipeline/pipeline.orchestrator');
const { runWorkerPool, runScheduledSync } = require('../src/pipelines/email-pipeline/ingestion/scheduler');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('runWorkerPool — continuous pool, not batches', () => {
  test('a worker that finishes early immediately picks up the next eligible user, not waiting for its sibling worker', async () => {
    // Users 1 and 3 resolve instantly; user 2 hangs until released manually.
    // With concurrency=2 processing [1,2,3]: worker A takes user 1, finishes
    // immediately, and MUST take user 3 next — without waiting for worker B
    // (still stuck on user 2) to finish. That's the "continuous pool"
    // behavior this test locks in, as opposed to a batch that would make
    // user 3 wait for user 2 to finish first since they'd be "in the same
    // batch".
    const order = [];
    const pending = {};
    const runOne = jest.fn((userId) => {
      order.push(`start:${userId}`);
      if (userId === 2) {
        return new Promise((resolve) => {
          pending[userId] = () => { order.push(`done:${userId}`); resolve(); };
        });
      }
      order.push(`done:${userId}`);
      return Promise.resolve();
    });

    const poolPromise = runWorkerPool([1, 2, 3], 2, runOne);

    // Let microtasks flush so worker A can finish user 1 and grab user 3
    // while worker B is still stuck awaiting user 2.
    for (let i = 0; i < 5; i++) await Promise.resolve();

    expect(order).toContain('start:3');
    expect(order).toContain('done:3');
    expect(order).not.toContain('done:2'); // still pending — proves 3 didn't wait on it

    pending[2]();
    await poolPromise;

    expect(runOne).toHaveBeenCalledTimes(3);
  });

  test("one user's rejection does not stop the pool from processing the rest", async () => {
    const processed = [];
    const runOne = jest.fn(async (userId) => {
      if (userId === 2) throw new Error('boom');
      processed.push(userId);
    });

    await runWorkerPool([1, 2, 3], 3, runOne);

    expect(processed.sort()).toEqual([1, 3]);
    expect(runOne).toHaveBeenCalledTimes(3); // user 2 was still attempted
  });

  test('never spawns more workers than there are users', async () => {
    const runOne = jest.fn().mockResolvedValue();
    await runWorkerPool([1, 2], 10, runOne);
    expect(runOne).toHaveBeenCalledTimes(2);
  });
});

describe('runScheduledSync — integration with repository + orchestrator', () => {
  test('only syncs users the repository reports as eligible (stopped/needs_reconnect already excluded there)', async () => {
    repository.getSchedulerEligibleUserIds.mockResolvedValue([10, 20]);
    syncUserEmails.mockResolvedValue({ jobsFound: 0 });

    await runScheduledSync();

    expect(syncUserEmails).toHaveBeenCalledWith(10);
    expect(syncUserEmails).toHaveBeenCalledWith(20);
    expect(syncUserEmails).toHaveBeenCalledTimes(2);
  });

  test("one user's sync failure does not stop the others from running", async () => {
    repository.getSchedulerEligibleUserIds.mockResolvedValue([1, 2, 3]);
    syncUserEmails.mockImplementation(async (userId) => {
      if (userId === 2) throw new Error('sync failed for user 2');
      return { jobsFound: 1 };
    });

    await expect(runScheduledSync()).resolves.toBeUndefined();
    expect(syncUserEmails).toHaveBeenCalledTimes(3);
  });

  test('a duplicate/already-running claim (ConflictError from startSync) for one user does not affect others', async () => {
    repository.getSchedulerEligibleUserIds.mockResolvedValue([1, 2]);
    syncUserEmails.mockImplementation(async (userId) => {
      if (userId === 1) throw new Error('A sync is already in progress. Please wait for it to finish.');
      return { jobsFound: 0 };
    });

    await runScheduledSync();

    expect(syncUserEmails).toHaveBeenCalledWith(1);
    expect(syncUserEmails).toHaveBeenCalledWith(2);
  });
});
