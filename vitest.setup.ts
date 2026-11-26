import 'fake-indexeddb/auto';
import { afterAll, afterEach, beforeEach, expect } from 'vitest';
import { resetRouteSnapshots } from '@/lib/routeSnapshotCache';
import { runTestResets } from '@/lib/testResets';
import { beginTestFetches, restoreRealTimers, settleOrWarn, trackIndexedDb } from '@/test/teardown';

beforeEach(() => {
  resetRouteSnapshots();
  runTestResets();
});

trackIndexedDb();
beforeEach(() => {
  beginTestFetches();
});
afterEach(async () => {
  restoreRealTimers();
  await settleOrWarn(expect.getState().currentTestName);
});
afterAll(async () => {
  await settleOrWarn(undefined);
});
