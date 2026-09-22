/**
 * Setup shared by both projects. Anything needing a real `document` lives in
 * `vitest.setup.dom.ts`, which only the `dom` project loads.
 */
import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { resetRouteSnapshots } from '@/lib/routeSnapshotCache';

/**
 * `lib/routeSnapshotCache.ts` is module state deliberately outliving a
 * component, so it also outlives a test. Without this, one route test's
 * loaded rows would be on screen for the next test's very first frame — the
 * assertions that survive that are the ones that were never testing the
 * loading path in the first place.
 */
beforeEach(() => {
  resetRouteSnapshots();
});
