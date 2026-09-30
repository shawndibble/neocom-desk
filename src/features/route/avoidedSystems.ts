/**
 * The pilot's **Avoided Systems**: solar systems they keep off their routes,
 * managed from Settings → Travel.
 *
 * ESI has no read for the game client's own autopilot avoidance list, so this
 * is the app's copy, entered by hand. Stored as solar system ids only; name
 * and security come off the local snapshot when shown.
 *
 * Synced, and one list for the whole account: "I never fly through Uedama" is
 * a fact about the pilot, not about one machine or one alt.
 */
import { useEffect } from 'react';
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const AVOIDED_SYSTEMS_KEY = 'sync.avoidedSystems';

/**
 * Any list, keeping only positive integer ids, deduped. What comes back from
 * sync was written by another device, possibly another build, so one bad
 * entry is dropped rather than costing the pilot the whole list.
 */
export function parseAvoidedSystems(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  return [
    ...new Set(
      raw.filter((id): id is number => typeof id === 'number' && Number.isInteger(id) && id > 0)
    ),
  ];
}

export function addAvoidedSystem(avoided: number[], systemId: number): number[] {
  return avoided.includes(systemId) ? avoided : [...avoided, systemId];
}

export function removeAvoidedSystem(avoided: readonly number[], systemId: number): number[] {
  return avoided.filter((id) => id !== systemId);
}

export const useAvoidedSystems = createSyncedSetting<number[]>({
  key: AVOIDED_SYSTEMS_KEY,
  defaultValue: [],
  parse: parseAvoidedSystems,
});

/**
 * The Avoided Systems, hydrated — for a page that routes with them. Pages like
 * Market or Travel never mount Settings, so reading the store bare would route
 * with the empty default until something else happened to hydrate it.
 *
 * `hydrated` lets a caller hold its answer until the real list is in, rather
 * than routing once with `[]` and then again.
 */
export function useAvoidedSystemIds(): { avoided: readonly number[]; hydrated: boolean } {
  const avoided = useAvoidedSystems((state) => state.value);
  const hydrated = useAvoidedSystems((state) => state.hydrated);
  const hydrate = useAvoidedSystems((state) => state.hydrate);
  useEffect(() => {
    void hydrate();
  }, [hydrate]);
  return { avoided, hydrated };
}
