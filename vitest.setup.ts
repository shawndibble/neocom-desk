/**
 * Setup shared by both projects. Anything needing a real `document` lives in
 * `vitest.setup.dom.ts`, which only the `dom` project loads.
 */
import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, expect } from 'vitest';
import { resetRouteSnapshots } from '@/lib/routeSnapshotCache';
import { beginTestFetches, restoreRealTimers, settleOrWarn, trackIndexedDb } from '@/test/teardown';

/**
 * `lib/routeSnapshotCache.ts` is module state deliberately outliving a
 * component, so it also outlives a test. Without this, one route test's
 * loaded rows would be on screen for the next test's very first frame — the
 * assertions that survive that are the ones that were never testing the
 * loading path in the first place.
 *
 * It also holds `useWarmLoad`'s values and the Industry workspace's last load
 * (`features/industry/workspaceLoadCache.ts`), so this reset covers those too.
 */
beforeEach(() => {
  resetRouteSnapshots();
});

/**
 * Deterministic teardown (`src/test/teardown.ts`): a test's leftover work can't
 * reach the next test, or outlive the file's environment. Each test's `fetch`
 * calls carry a signal that `vitest.runner.ts` aborts as soon as the test body
 * ends, and IndexedDB opens and transactions are tracked.
 *
 * Hooks run in stack order, so this `afterEach` runs after the test file's own
 * and, in the dom project, after `vitest.setup.dom.ts`'s unmount. It puts real
 * timers back (a test that fakes them should still restore them itself), then
 * waits for every request and IndexedDB write still going. Don't hand-roll
 * drains in a test file.
 */
trackIndexedDb();
beforeEach(() => {
  beginTestFetches();
});
afterEach(async () => {
  restoreRealTimers();
  await settleOrWarn(expect.getState().currentTestName);
});
/** Work started by the file's own `afterAll` (a `server.close()`, a `db.close()`). */
afterAll(async () => {
  await settleOrWarn(undefined);
});
