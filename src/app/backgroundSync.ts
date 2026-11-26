import { MINUTE_MS } from '@/lib/age';
import { useEffect, useRef } from 'react';
import { getSyncStatus, scheduleSync } from '@/sync';
import { isSyncConfigured } from './syncStatus';
import { joinTabElection, type TabElectionSeat } from '@/lib/tabLeader';
import { readLocal, writeLocal } from '@/lib/safeLocalStorage';

export const BACKGROUND_SYNC_MIN_GAP_MS = 5 * MINUTE_MS;

export const BACKGROUND_SYNC_NON_ACTIVE_GAP_MS = 20 * MINUTE_MS;

export const BACKGROUND_SYNC_TICK_MS = MINUTE_MS;

export const BACKGROUND_SYNC_BOOT_DELAY_MS = 10 * 1000;

export const SWEEP_STAMPS_KEY = 'neocom.backgroundSync.lastSweptAt';

function mergeSharedStamps(into: Map<number, number>): void {
  try {
    const raw: unknown = JSON.parse(readLocal(SWEEP_STAMPS_KEY) ?? '{}');
    if (typeof raw !== 'object' || raw === null) return;
    for (const [id, at] of Object.entries(raw)) {
      if (typeof at === 'number' && at > (into.get(Number(id)) ?? -Infinity)) {
        into.set(Number(id), at);
      }
    }
  } catch {}
}

function writeSharedStamps(stamps: ReadonlyMap<number, number>): void {
  writeLocal(SWEEP_STAMPS_KEY, JSON.stringify(Object.fromEntries(stamps)));
}

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

export function useBackgroundSync(
  characterIds: readonly number[],
  activeCharacterId: number | null = null
): void {
  const lastSweptAt = useRef(new Map<number, number>());
  const bootSweepAt = useRef<number | null>(null);
  const idsRef = useRef(characterIds);
  const activeRef = useRef(activeCharacterId);
  useEffect(() => {
    idsRef.current = characterIds;
    activeRef.current = activeCharacterId;
  });
  const key = characterIds.join(',');
  const active = key !== '' && isSyncConfigured();

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
      if (document.visibilityState !== 'visible') return;
      if (!seat.current?.isLeader()) return;
      const now = Date.now();
      mergeSharedStamps(lastSweptAt.current);
      for (const characterId of idsRef.current) {
        const synced = getSyncStatus(characterId).lastFullSyncAt;
        if (synced !== undefined && synced > (lastSweptAt.current.get(characterId) ?? -Infinity)) {
          lastSweptAt.current.set(characterId, synced);
        }
      }
      const due = idsToSweep(idsRef.current, lastSweptAt.current, now, activeRef.current);
      for (const characterId of due) {
        if (getSyncStatus(characterId).state === 'syncing') continue;
        lastSweptAt.current.set(characterId, now);
        scheduleSync(characterId, { priority: 'background' });
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
