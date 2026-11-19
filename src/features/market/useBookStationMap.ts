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
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

type StationMap = ReadonlyMap<number, NpcStationLookup>;

/** Player-structure id → its solar system, from the book's own orders. Only the id block decides, so an NPC station missing from the SDE is never sent to ESI. */
function structureSystemsIn(orders: readonly RegionOrder[]): Map<number, number> {
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
  // Tagged with the Character that resolved them: the ACL is per Character, so
  // a name one could see is not carried over to the next one signed in.
  const [resolved, setResolved] = useState<{ characterId: number; names: StationMap } | null>(null);

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
    const next = new Map<number, NpcStationLookup>();
    void mapWithConcurrencyLimit(places, ESI_FANOUT_CONCURRENCY, async ([id, systemId]) => {
      // A failed lookup leaves the row "Unknown Structure", the same as a refusal.
      const name = await loadStructureNameNoRoster(characterId, id).catch(() => null);
      if (name) next.set(id, { name, systemId });
    }).then(() => {
      if (cancelled || next.size === 0) return;
      // Accumulates: a name learnt for one book stays for the next item opened.
      setResolved((prev) => ({
        characterId,
        names: new Map([...(prev?.characterId === characterId ? prev.names : []), ...next]),
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [characterId, key]);

  const structures = resolved?.characterId === characterId ? resolved.names : null;
  return useMemo(
    () => (structures === null ? npcStationMap : new Map([...npcStationMap, ...structures])),
    [npcStationMap, structures]
  );
}
