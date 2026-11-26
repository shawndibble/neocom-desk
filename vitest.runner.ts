import type { RunnerTestSuite } from 'vitest';
import { VitestTestRunner } from 'vitest/runners';

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
