import { useEffect, useMemo, useState } from 'react';
import type { Contract } from '@/esi/endpoints';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadContractLocationName } from './contractLocationName';

/**
 * Names for the courier start and end places of `contracts`, for the export
 * (a sync read can't wait on a lookup). The same cached resolver the table's
 * route label uses: an NPC station names from the SDE with no request, a
 * structure is read once and cached, at most `ESI_FANOUT_CONCURRENCY` at a time.
 * A place that doesn't resolve stays out of the map.
 */
export function useCourierLocationNames(
  contracts: readonly Contract[],
  characterIdFor: (contract: Contract) => number | null
): ReadonlyMap<number, string> {
  const [names, setNames] = useState<ReadonlyMap<number, string>>(new Map());
  const wanted = useMemo(() => {
    const places = new Map<number, number>();
    for (const contract of contracts) {
      if (contract.type !== 'courier') continue;
      const characterId = characterIdFor(contract);
      if (characterId === null) continue;
      for (const id of [contract.start_location_id, contract.end_location_id]) {
        if (id && !places.has(id)) places.set(id, characterId);
      }
    }
    return [...places];
  }, [contracts, characterIdFor]);
  useEffect(() => {
    if (wanted.length === 0) return;
    let cancelled = false;
    const found = new Map<number, string>();
    void mapWithConcurrencyLimit(wanted, ESI_FANOUT_CONCURRENCY, async ([id, characterId]) => {
      const name = await loadContractLocationName(characterId, id).catch(() => null);
      if (name) found.set(id, name);
    }).then(() => {
      if (!cancelled) setNames((current) => new Map([...current, ...found]));
    });
    return () => {
      cancelled = true;
    };
  }, [wanted]);
  return names;
}
