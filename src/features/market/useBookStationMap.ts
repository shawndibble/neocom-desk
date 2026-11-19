/**
 * The order book's station lookup: the SDE's NPC stations plus the player
 * structures the book's orders sit in. `resolveOrderLocation` only knows the
 * former, so without this a public structure's orders read "Unknown Structure".
 *
 * A structure's name comes from `GET /universe/structures/{id}` through
 * `loadStructureNameNoRoster` — cache-first, with refusals memoised, so a
 * structure the signed-in Character cannot see costs one call a day, not one
 * per visit. Idle with no Character: the names need a token.
 */
import { useEffect, useMemo, useState } from 'react';
import type { RegionOrder } from '@/esi/endpoints';
import { UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import type { NpcStationLookup } from '@/engine/market/orderBook';
import { loadStructureNameNoRoster } from '@/features/character/structures';

type StationMap = ReadonlyMap<number, NpcStationLookup>;

/** Player-structure id → its solar system, from the book's own orders. Only the id block decides, so an NPC station missing from the SDE is never sent to ESI. */
export function structureSystemsIn(orders: readonly RegionOrder[]): Map<number, number> {
  const systems = new Map<number, number>();
  for (const order of orders) {
    if (order.location_id >= UPWELL_STRUCTURE_ID_FLOOR) {
      systems.set(order.location_id, order.system_id);
    }
  }
  return systems;
}

export function useBookStationMap(
  npcStationMap: StationMap,
  characterId: number | null,
  sortedSell: readonly RegionOrder[],
  sortedBuy: readonly RegionOrder[]
): StationMap {
  const [structures, setStructures] = useState<StationMap>(new Map());

  // A string key ("id:system,..."), so a re-sorted or re-filtered book of the
  // same structures re-runs nothing.
  const key = useMemo(
    () =>
      [...structureSystemsIn([...sortedSell, ...sortedBuy])]
        .sort(([a], [b]) => a - b)
        .map(([id, systemId]) => `${id}:${systemId}`)
        .join(','),
    [sortedSell, sortedBuy]
  );

  useEffect(() => {
    if (characterId === null || key === '') return;
    let cancelled = false;
    const places = key.split(',').map((pair) => pair.split(':').map(Number) as [number, number]);
    void Promise.all(
      places.map(
        async ([id, systemId]) =>
          [
            id,
            systemId,
            await loadStructureNameNoRoster(characterId, id).catch(() => null),
          ] as const
      )
    ).then((resolved) => {
      if (cancelled) return;
      const next = new Map<number, NpcStationLookup>();
      for (const [id, systemId, name] of resolved) {
        if (name) next.set(id, { name, systemId });
      }
      // Accumulates: a name learnt for one book stays for the next item opened.
      setStructures((prev) => (next.size === 0 ? prev : new Map([...prev, ...next])));
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, key]);

  return useMemo(
    () => (structures.size === 0 ? npcStationMap : new Map([...npcStationMap, ...structures])),
    [npcStationMap, structures]
  );
}
