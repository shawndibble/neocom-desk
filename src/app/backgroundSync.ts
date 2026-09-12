/**
 * Keeps a long-lived tab's synced data fresh.
 *
 * `App.tsx` syncs the active Character once, at boot and on every Character
 * switch. That is enough to *publish* an edit — `scheduleSync` runs at each
 * mutation site — but nothing ever *pulls* again. A desktop tab left open all
 * day therefore never learns that the phone dismissed an alert, and the user
 * dismisses it a second time. The phone looks fine only because a PWA gets
 * relaunched constantly, which is to say it boots.
 *
 * Three deliberate shapes here:
 *
 * - **Every Character, not the active one.** The Alerts page lists every
 *   Character's rows together, but `sync/planSync.syncFeed` is per-Character
 *   and syncs only the one it was called for. A Character the user is not
 *   currently looking through was therefore never reconciled on this device
 *   at all.
 * - **A tick plus `visibilitychange`, not either alone.** `visibilitychange`
 *   catches the phone coming back from the lock screen, but it does *not*
 *   fire when the user switches to another application and leaves the tab as
 *   its window's foreground tab — which is the reported case exactly: Alerts
 *   open on the desktop, dismissed on the phone, looked at again on the
 *   desktop. The tick covers that. Both go through the same gate.
 * - **The gate is per Character, and time-based.** Per Character so a newly
 *   added one is reconciled at once instead of waiting out a gap some other
 *   Character started; time-based because a sweep is not free —
 *   `sync/syncAuth.ensureSignedIn` mints a Firebase custom token per
 *   Character and leaves the session signed in as the last one, so N
 *   Characters is N callable invocations. {@link BACKGROUND_SYNC_MIN_GAP_MS}
 *   is what keeps alt-tabbing from turning that into a mint storm, and the
 *   tick is deliberately far shorter than it: a tick that finds nothing due
 *   is a map lookup.
 */
import { useEffect, useRef } from 'react';
import { getSyncStatus, scheduleSync } from '@/sync';
import { isSyncConfigured } from './syncStatus';

/**
 * Smallest gap between two sweeps *of one Character*. Five minutes is well
 * inside "fresh enough to read" and well outside "every time the mouse leaves
 * the window".
 */
export const BACKGROUND_SYNC_MIN_GAP_MS = 5 * 60 * 1000;

/**
 * How often the gate is re-checked. Not the sync cadence —
 * {@link BACKGROUND_SYNC_MIN_GAP_MS} is that. Kept well under the gap so the
 * gap, rather than the boundary between two equal periods, is what decides
 * when a sweep happens.
 */
export const BACKGROUND_SYNC_TICK_MS = 60 * 1000;

/** Pure so the throttle is testable without a clock or a DOM event. */
export function shouldSweep(
  lastSweptAt: number | null,
  now: number,
  minGapMs: number = BACKGROUND_SYNC_MIN_GAP_MS
): boolean {
  return lastSweptAt === null || now - lastSweptAt >= minGapMs;
}

/** Which of `ids` are due, given when each was last swept. */
export function idsToSweep(
  ids: readonly number[],
  lastSweptAt: ReadonlyMap<number, number>,
  now: number,
  minGapMs: number = BACKGROUND_SYNC_MIN_GAP_MS
): number[] {
  return ids.filter((id) => shouldSweep(lastSweptAt.get(id) ?? null, now, minGapMs));
}

/**
 * Sweeps on mount, on every tick, and whenever the tab is looked at again.
 *
 * The last-sweep stamps are a ref rather than module state so they die with
 * the component — there is exactly one mount of this in the app, and module
 * state would only leak between tests.
 *
 * The caller's list comes from `useLiveQuery`, which hands back a fresh array
 * on every render and an *empty* one before Dexie answers. Neither can be the
 * effect's dependency as-is: the identity churn would re-register the
 * listeners every render, and depending on nothing at all would mean the one
 * sweep this hook ever ran happened while the list was still empty. The
 * joined string changes exactly when the set of Characters does.
 */
export function useBackgroundSync(characterIds: readonly number[]): void {
  const lastSweptAt = useRef(new Map<number, number>());
  const key = characterIds.join(',');

  useEffect(() => {
    if (key === '' || !isSyncConfigured()) return;
    const ids = key.split(',').map(Number);

    const sweep = () => {
      // A hidden tab has nobody reading its alerts, and sweeping one would
      // spend the gap that the first real look wants.
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      for (const characterId of idsToSweep(ids, lastSweptAt.current, now)) {
        // A sync already in flight covers this Character. Scheduling a second
        // one behind it would re-read every collection and, since the sweep
        // signs the session in as each Character in turn, re-mint its token.
        if (getSyncStatus(characterId).state === 'syncing') continue;
        lastSweptAt.current.set(characterId, now);
        scheduleSync(characterId);
      }
    };

    sweep();
    document.addEventListener('visibilitychange', sweep);
    const tick = window.setInterval(sweep, BACKGROUND_SYNC_TICK_MS);
    return () => {
      document.removeEventListener('visibilitychange', sweep);
      window.clearInterval(tick);
    };
  }, [key]);
}
