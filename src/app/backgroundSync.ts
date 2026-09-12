/**
 * Keeps a long-lived tab's synced data fresh.
 *
 * `App.tsx` syncs the active Character at boot and on every switch, and each
 * mutation site schedules its own sync. Between them nothing ever *pulls*
 * again, so a tab left open never learns that another device dismissed an
 * alert, and a Character the user is not looking through is never reconciled
 * on this device at all.
 *
 * Three constraints shape the sweep, argued in full in
 * `docs/context/decisions/20260912-125743-alert-dismissals-push-on-dismiss-a-visible-tab.md`:
 * it covers every Character, it runs on a tick *and* on `visibilitychange`
 * (neither alone catches an app switch that leaves the tab foregrounded), and
 * it is gated per Character by {@link BACKGROUND_SYNC_MIN_GAP_MS} because
 * `sync/syncAuth.ensureSignedIn` mints a Firebase custom token per Character.
 */
import { useEffect, useRef } from 'react';
import { getSyncStatus, scheduleSync } from '@/sync';
import { isSyncConfigured } from './syncStatus';

/**
 * Smallest gap between two sweeps *of one Character*. Five minutes is well
 * inside "fresh enough to read" and well outside "every time the mouse leaves
 * the window", which is what a `visibilitychange` gate has to survive.
 */
export const BACKGROUND_SYNC_MIN_GAP_MS = 5 * 60 * 1000;

/**
 * How often the gate is re-checked. Not the sync cadence —
 * {@link BACKGROUND_SYNC_MIN_GAP_MS} is that. Kept well under the gap so the
 * gap, rather than the boundary between two equal periods, decides.
 */
export const BACKGROUND_SYNC_TICK_MS = 60 * 1000;

/**
 * Which of `ids` are due, given when each was last swept. Pure so the throttle
 * is testable without a clock or a DOM event.
 */
export function idsToSweep(
  ids: readonly number[],
  lastSweptAt: ReadonlyMap<number, number>,
  now: number,
  minGapMs: number = BACKGROUND_SYNC_MIN_GAP_MS
): number[] {
  return ids.filter((id) => {
    const last = lastSweptAt.get(id);
    return last === undefined || now - last >= minGapMs;
  });
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
 * sweep this hook ever ran happened while the list was still empty. Hence the
 * latest-ref pattern (`market/useCompareRows.ts`) against a joined key that
 * changes exactly when the set of Characters does.
 */
export function useBackgroundSync(characterIds: readonly number[]): void {
  const lastSweptAt = useRef(new Map<number, number>());
  const idsRef = useRef(characterIds);
  useEffect(() => {
    idsRef.current = characterIds;
  });
  const key = characterIds.join(',');

  useEffect(() => {
    if (key === '' || !isSyncConfigured()) return;

    const sweep = () => {
      // A hidden tab has nobody reading its alerts, and sweeping one would
      // spend the gap that the first real look wants.
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      for (const characterId of idsToSweep(idsRef.current, lastSweptAt.current, now)) {
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
