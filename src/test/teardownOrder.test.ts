import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { END_TEST_WORK } from './teardown';

/**
 * Pins the internal @vitest/runner order `vitest.runner.ts` relies on: a
 * runner's `onTaskFinished` runs before the test's `afterEach` hooks. If a
 * Vitest upgrade moves it after them, the test-end abort would land after a
 * file's own resets (see teardown.ts "Order matters"), so this fails loudly.
 *
 * The tests run in order and depend on it: the first records, the second checks.
 */
describe('vitest.runner.ts onTaskFinished', () => {
  const globals = globalThis as Record<symbol, unknown>;
  const original = globals[END_TEST_WORK] as () => Promise<void>;
  const calls: string[] = [];

  beforeAll(() => {
    globals[END_TEST_WORK] = async () => {
      calls.push('onTaskFinished');
      await original();
    };
  });
  afterAll(() => {
    globals[END_TEST_WORK] = original;
  });
  afterEach(() => {
    calls.push('afterEach');
  });

  it('records one test end', () => {
    calls.length = 0;
  });

  it('ran before the afterEach hooks', () => {
    expect(calls).toEqual(['onTaskFinished', 'afterEach']);
  });
});
