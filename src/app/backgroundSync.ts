/**
 * Keeps a long-lived tab's synced data fresh (issue #362's other half).
 *
 * `App.tsx` syncs the active Character once, at boot and on every Character
 * switch. That is enough to *publish* an edit — `scheduleSync` runs at each
 * mutation site — but nothing ever *pulls* again. A desktop tab left open all
 * day therefore never learns that the phone dismissed an alert, and the user
 * dismisses it a second time. The phone looks fine only because a PWA gets
 * relaunched constantly, which is to say it boots.
 *
 * Two deliberate shapes here:
 *
 * - **Every Character, not the active one.** The Alerts page lists every
 *   Character's rows together, but `sync/planSync.syncFeed` is per-Character
 *   and syncs only the one it was called for. A Character the user is not
 *   currently looking through was therefore never reconciled on this device
 *   at all.
 * - **On the tab becoming visible, not on a timer.** A sweep is not free:
 *   `sync/syncAuth.ensureSignedIn` mints a Firebase custom token per
 *   Character and leaves the Firebase session signed in as the last one, so N
 *   Characters is N callable invocations and N sign-ins. A hidden tab has
 *   nobody reading its alerts; the instant somebody does, `visibilitychange`
 *   fires. That buys the freshness an interval would, at boot-shaped cost
 *   rather than forever-cost.
 *
 * {@link BACKGROUND_SYNC_MIN_GAP_MS} is what keeps alt-tabbing from turning
 * into a mint storm.
 */
import { useEffect, useMemo, useRef } from 'react';
import { scheduleSync } from '@/sync';
import { isSyncConfigured } from './syncStatus';

/**
 * Smallest gap between two sweeps. Alt-tabbing fires `visibilitychange` as
 * fast as the user can switch windows, and each sweep costs a token mint per
 * Character; five minutes is well inside "fresh enough to read" and well
 * outside "every time the mouse leaves the window".
 */
export const BACKGROUND_SYNC_MIN_GAP_MS = 5 * 60 * 1000;

/** Pure so the throttle is testable without a clock or a DOM event. */
export function shouldSweep(
  lastSweptAt: number | null,
  now: number,
  minGapMs: number = BACKGROUND_SYNC_MIN_GAP_MS
): boolean {
  return lastSweptAt === null || now - lastSweptAt >= minGapMs;
}

/**
 * Sweeps on mount and whenever the tab is looked at again.
 *
 * The last-sweep stamp is a ref rather than module state so it dies with the
 * component — there is exactly one mount of this in the app, and module state
 * would only leak between tests.
 *
 * The caller's list comes from `useLiveQuery`, which hands back a fresh array
 * on every render and an *empty* one before Dexie answers. Neither can be the
 * effect's dependency as-is: the identity churn would re-register the listener
 * every render, and depending on nothing at all would mean the one sweep this
 * hook ever ran happened while the list was still empty. Reducing to a string
 * and back gives a dependency that changes exactly when the set of Characters
 * does — so the sweep re-runs when the real list lands, and not otherwise.
 */
export function useBackgroundSync(characterIds: readonly number[]): void {
  const lastSweptAt = useRef<number | null>(null);
  const key = characterIds.join(',');
  const ids = useMemo(() => (key === '' ? [] : key.split(',').map(Number)), [key]);

  useEffect(() => {
    if (ids.length === 0 || !isSyncConfigured()) return;

    const sweep = () => {
      const now = Date.now();
      if (!shouldSweep(lastSweptAt.current, now)) return;
      lastSweptAt.current = now;
      for (const characterId of ids) scheduleSync(characterId);
    };

    sweep();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sweep();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [ids]);
}
