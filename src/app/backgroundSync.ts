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
 *
 * That one Firebase session is also why the order matters: the sweep queues
 * the active Character last, so the session is left on the Character the
 * user is editing, and it queues everything as background priority so an
 * edit-triggered sync overtakes the rest of the sweep (`sync/planSync.ts`
 * `SyncPriority`) instead of waiting behind every Character.
 */
import { useEffect, useRef } from 'react';
import { getSyncStatus, scheduleSync } from '@/sync';
import { isSyncConfigured } from './syncStatus';
import { joinTabElection, type TabElectionSeat } from '@/lib/tabLeader';

/**
 * Smallest gap between two sweeps *of the active Character*. Five minutes is
 * well inside "fresh enough to read" and well outside "every time the mouse
 * leaves the window", which is what a `visibilitychange` gate has to survive.
 */
export const BACKGROUND_SYNC_MIN_GAP_MS = 5 * 60 * 1000;

/**
 * The same gap for every *other* Character. Nobody is looking through them,
 * and each one costs a token mint and a session swap, so they can wait longer.
 */
export const BACKGROUND_SYNC_NON_ACTIVE_GAP_MS = 20 * 60 * 1000;

/**
 * How often the gate is re-checked. Not the sync cadence —
 * {@link BACKGROUND_SYNC_MIN_GAP_MS} is that. Kept well under the gap so the
 * gap, rather than the boundary between two equal periods, decides.
 */
export const BACKGROUND_SYNC_TICK_MS = 60 * 1000;

/**
 * How long after boot the first sweep waits. Boot already syncs the active
 * Character (`App.tsx`) and the visible route is making its own reads; a sweep
 * of every Character on top — each minting a Firebase token — only competes
 * with them. A few seconds later it costs nobody anything.
 */
export const BACKGROUND_SYNC_BOOT_DELAY_MS = 10 * 1000;

/**
 * localStorage key for the last-sweep stamps, shared by every tab so that a tab
 * taking leadership over (`lib/tabLeader.ts`) does not re-sweep every
 * Character the previous leader swept a minute ago.
 */
export const SWEEP_STAMPS_KEY = 'neocom.backgroundSync.lastSweptAt';

/** Fold the other tabs' stamps into `into`, keeping the later of each. */
function mergeSharedStamps(into: Map<number, number>): void {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(SWEEP_STAMPS_KEY) ?? '{}');
    if (typeof raw !== 'object' || raw === null) return;
    for (const [id, at] of Object.entries(raw)) {
      if (typeof at === 'number' && at > (into.get(Number(id)) ?? -Infinity)) {
        into.set(Number(id), at);
      }
    }
  } catch {
    // Unreadable or blocked storage: this tab's own stamps still gate it.
  }
}

function writeSharedStamps(stamps: ReadonlyMap<number, number>): void {
  try {
    localStorage.setItem(SWEEP_STAMPS_KEY, JSON.stringify(Object.fromEntries(stamps)));
  } catch {
    // Blocked or full storage: other tabs just fall back to their own stamps.
  }
}

/**
 * Which of `ids` are due, given when each was last swept, in the order to
 * sweep them. Pure so the throttle is testable without a clock or a DOM event.
 *
 * The active Character has the shorter gap and always comes last. It is also
 * appended whenever any other Character is swept, due or not: the sweep signs
 * the one Firebase session in as each Character in turn, and ending on anyone
 * else would make the next edit re-mint the active Character's token.
 */
export function idsToSweep(
  ids: readonly number[],
  lastSweptAt: ReadonlyMap<number, number>,
  now: number,
  activeCharacterId: number | null
): number[] {
  const isDue = (id: number) => {
    const last = lastSweptAt.get(id);
    const gap =
      id === activeCharacterId ? BACKGROUND_SYNC_MIN_GAP_MS : BACKGROUND_SYNC_NON_ACTIVE_GAP_MS;
    return last === undefined || now - last >= gap;
  };
  const others = ids.filter((id) => id !== activeCharacterId && isDue(id));
  if (activeCharacterId === null || !ids.includes(activeCharacterId)) return others;
  return others.length > 0 || isDue(activeCharacterId) ? [...others, activeCharacterId] : [];
}

/**
 * Sweeps shortly after mount ({@link BACKGROUND_SYNC_BOOT_DELAY_MS}), on every
 * tick, and whenever the tab is looked at again. A Character added later is
 * swept at once — only the boot sweep waits.
 *
 * A Character that finished a sync inside the gap by any other route (the
 * boot sync of the active Character, a mutation's own sync) counts as swept:
 * re-reading every collection straight after would re-mint its token for
 * nothing.
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
export function useBackgroundSync(
  characterIds: readonly number[],
  activeCharacterId: number | null = null
): void {
  const lastSweptAt = useRef(new Map<number, number>());
  /** When the boot hold-off ends; set by the first effect run that has Characters. */
  const bootSweepAt = useRef<number | null>(null);
  const idsRef = useRef(characterIds);
  const activeRef = useRef(activeCharacterId);
  useEffect(() => {
    idsRef.current = characterIds;
    activeRef.current = activeCharacterId;
  });
  const key = characterIds.join(',');
  const active = key !== '' && isSyncConfigured();

  // One tab — the Tab Leader for the sweep — sweeps every Character for all of
  // them. Its own effect, so a change to the Character list keeps the seat.
  const seat = useRef<TabElectionSeat | null>(null);
  const onLeaderChange = useRef(() => {});
  useEffect(() => {
    if (!active) return;
    const joined = joinTabElection('sweep', () => onLeaderChange.current());
    seat.current = joined;
    return () => {
      joined.leave();
      seat.current = null;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;

    const sweep = () => {
      // A hidden tab has nobody reading its alerts, and sweeping one would
      // spend the gap that the first real look wants.
      if (document.visibilityState !== 'visible') return;
      if (!seat.current?.isLeader()) return;
      const now = Date.now();
      mergeSharedStamps(lastSweptAt.current);
      for (const characterId of idsRef.current) {
        const synced = getSyncStatus(characterId).lastSyncedAt;
        if (synced !== null && synced > (lastSweptAt.current.get(characterId) ?? -Infinity)) {
          lastSweptAt.current.set(characterId, synced);
        }
      }
      const due = idsToSweep(idsRef.current, lastSweptAt.current, now, activeRef.current);
      for (const characterId of due) {
        // A sync already in flight covers this Character. Scheduling a second
        // one behind it would re-read every collection and, since the sweep
        // signs the session in as each Character in turn, re-mint its token.
        if (getSyncStatus(characterId).state === 'syncing') continue;
        lastSweptAt.current.set(characterId, now);
        scheduleSync(characterId, undefined, 'background');
      }
      writeSharedStamps(lastSweptAt.current);
    };

    bootSweepAt.current ??= Date.now() + BACKGROUND_SYNC_BOOT_DELAY_MS;
    const holdOff = bootSweepAt.current - Date.now();
    let bootSweep: number | undefined;
    if (holdOff > 0) bootSweep = window.setTimeout(sweep, holdOff);
    else sweep();
    document.addEventListener('visibilitychange', sweep);
    const tick = window.setInterval(sweep, BACKGROUND_SYNC_TICK_MS);
    // A tab taking leadership over sweeps at once — but not before the boot
    // hold-off, which winning the election at boot would otherwise skip.
    onLeaderChange.current = () => {
      if (Date.now() >= (bootSweepAt.current ?? Infinity)) sweep();
    };
    return () => {
      onLeaderChange.current = () => {};
      window.clearTimeout(bootSweep);
      document.removeEventListener('visibilitychange', sweep);
      window.clearInterval(tick);
    };
  }, [key, active]);
}
