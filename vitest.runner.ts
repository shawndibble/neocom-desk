import type { RunnerTestSuite } from 'vitest';
import { VitestTestRunner } from 'vitest/runners';

/**
 * Vitest's runner plus two steps:
 *
 * - When a test's body has finished (passed or failed), abort its in-flight
 *   `fetch` calls and let their consequences land before any `afterEach` runs.
 *   A hook can't do this: setup-file `afterEach` hooks run after the test
 *   file's own, so an abort there would trip state (a price source marked
 *   down) after the file had already reset it. From then until the next test
 *   or suite starts, a new `fetch` is the ended test's leftover work and is
 *   refused.
 * - When a suite starts, its `beforeAll` may fetch again (a warm-up render).
 *
 * The work lives in `src/test/teardown.ts`, loaded by `vitest.setup.ts`; it is
 * reached through globals so this file and the setup share one instance of it.
 */
const END_TEST_WORK = Symbol.for('neocom-desk.endTestWork');
const BEGIN_SUITE = Symbol.for('neocom-desk.beginSuite');

function teardownStep(key: symbol): (() => unknown) | undefined {
  const step = (globalThis as Record<symbol, unknown>)[key];
  return typeof step === 'function' ? (step as () => unknown) : undefined;
}

export default class TeardownRunner extends VitestTestRunner {
  async onBeforeRunSuite(suite: RunnerTestSuite): Promise<void> {
    await super.onBeforeRunSuite(suite);
    teardownStep(BEGIN_SUITE)?.();
  }

  async onTaskFinished(): Promise<void> {
    await teardownStep(END_TEST_WORK)?.();
  }
}
