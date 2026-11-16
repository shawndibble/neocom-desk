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
 * - When a suite starts, its `beforeAll` may fetch again (a warm-up render),
 *   once the last test's leftovers have been drained. When a nested suite
 *   ends, leftovers are refused again until the next test or suite.
 *
 * The work lives in `src/test/teardown.ts`, loaded by `vitest.setup.ts`; it is
 * reached through globals so this file and the setup share one instance of it.
 */
const END_TEST_WORK = Symbol.for('neocom-desk.endTestWork');
const BEGIN_SUITE_FETCHES = Symbol.for('neocom-desk.beginSuiteFetches');
const END_SUITE_FETCHES = Symbol.for('neocom-desk.endSuiteFetches');

function teardownStep(key: symbol): (() => unknown) | undefined {
  const step = (globalThis as Record<symbol, unknown>)[key];
  return typeof step === 'function' ? (step as () => unknown) : undefined;
}

export default class TeardownRunner extends VitestTestRunner {
  async onBeforeRunSuite(suite: RunnerTestSuite): Promise<void> {
    await super.onBeforeRunSuite(suite);
    await teardownStep(BEGIN_SUITE_FETCHES)?.();
  }

  async onAfterRunSuite(suite: RunnerTestSuite): Promise<void> {
    if (suite.file !== suite) teardownStep(END_SUITE_FETCHES)?.();
    await super.onAfterRunSuite(suite);
  }

  async onTaskFinished(): Promise<void> {
    await teardownStep(END_TEST_WORK)?.();
  }
}
