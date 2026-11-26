import { useEffect, useMemo, useState } from 'react';
import type { RegionOrder } from '@/esi/endpoints';
import { UPWELL_STRUCTURE_ID_FLOOR } from '@/esi/locationIds';
import type { NpcStationLookup } from '@/engine/market/orderBook';
import { loadStructureNameNoRoster } from '@/features/character/structures';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';

type StationMap = ReadonlyMap<number, NpcStationLookup>;

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
  const [resolved, setResolved] = useState<{ characterId: number; names: StationMap } | null>(null);

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
      const name = await loadStructureNameNoRoster(characterId, id).catch(() => null);
      if (name) next.set(id, { name, systemId });
    }).then(() => {
      if (cancelled || next.size === 0) return;
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
