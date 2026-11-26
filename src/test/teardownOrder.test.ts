import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { END_TEST_WORK } from './teardown';

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
