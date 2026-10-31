import { useCallback, useMemo } from 'react';
import type { Contract } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { loadContractLocationName } from './contractLocationName';

const NO_NAMES: ReadonlyMap<number, string> = new Map();

/**
 * Names for the courier start and end places of `contracts`, for the export (a sync read can't
 * wait on a lookup). One keyed load on the contracts' own ids, so a filter change doesn't reload.
 */
export function useCourierLocationNames(
  contracts: readonly Contract[],
  characterIdFor: (contract: Contract) => number | null,
  enabled: boolean
): ReadonlyMap<number, string> {
  const places = useMemo(() => {
    const byPlace = new Map<number, number>();
    for (const contract of contracts) {
      if (contract.type !== 'courier') continue;
      const characterId = characterIdFor(contract);
      if (characterId === null) continue;
      for (const id of [contract.start_location_id, contract.end_location_id]) {
        if (id && !byPlace.has(id)) byPlace.set(id, characterId);
      }
    }
    return [...byPlace];
  }, [contracts, characterIdFor]);
  const key =
    places.length > 0 ? places.map(([id, characterId]) => `${characterId}:${id}`).join(',') : null;
  // Reads the key, not `places`, so the loader only changes when the ids do.
  const load = useCallback(async () => {
    const found = new Map<number, string>();
    const wanted = (key?.split(',') ?? []).map((pair) => pair.split(':').map(Number));
    await mapWithConcurrencyLimit(wanted, ESI_FANOUT_CONCURRENCY, async ([characterId, id]) => {
      const name = await loadContractLocationName(characterId, id).catch(() => null);
      if (name) found.set(id, name);
    });
    return found;
  }, [key]);
  return useKeyedLoad(key, load, !enabled).data ?? NO_NAMES;
}
