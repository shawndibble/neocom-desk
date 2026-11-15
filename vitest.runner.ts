import { VitestTestRunner } from 'vitest/runners';

/**
 * Vitest's runner plus one step: when a test's body has finished (passed or
 * failed), abort its in-flight `fetch` calls and let their consequences land
 * before any `afterEach` runs. A hook can't do this: setup-file `afterEach`
 * hooks run after the test file's own, so an abort there would trip state
 * (a price source marked down) after the file had already reset it.
 *
 * The work lives in `src/test/teardown.ts`, loaded by `vitest.setup.ts`; it is
 * reached through a global so this file and the setup share one instance of it.
 */
const END_TEST_WORK = Symbol.for('neocom-desk.endTestWork');

export default class TeardownRunner extends VitestTestRunner {
  async onTaskFinished(): Promise<void> {
    const endTestWork = (globalThis as Record<symbol, unknown>)[END_TEST_WORK];
    if (typeof endTestWork === 'function') await (endTestWork as () => Promise<void>)();
  }
}
