import { useEffect, useState } from 'react';
import type { IndustryActivity } from '@/engine/industry/types';
import { cheaperNearbySystems } from '@/engine/industry/cheaperNearbySystems';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { loadSystemCostIndices } from './marketData';

export interface NearbyCostIndex {
  id: number;
  name: string;
  security: number;
  jumps: number;
  index: number;
}

/**
 * The 5 cheapest systems within 5 jumps whose index for `activity` beats
 * `index`, cheapest first. Empty while loading, on a failed read, when none
 * is cheaper, or without a system. Shared by the trend popover's list and the
 * Costs & revenue ledger's one-line hint.
 */
export function useCheaperNearbySystems(
  systemId: number | undefined,
  activity: IndustryActivity,
  index: number | null
): NearbyCostIndex[] {
  const key = `${systemId}:${activity}:${index}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: NearbyCostIndex[] } | null>(null);
  useEffect(() => {
    if (systemId === undefined || index === null) return;
    let live = true;
    void (async () => {
      const [graph, systems, indices] = await Promise.all([
        loadJumpGraph().catch(() => undefined),
        loadSolarSystemsById().catch(() => null),
        loadSystemCostIndices(activity).catch(() => null),
      ]);
      if (!live || !graph || !systems || !indices) return;
      const found = cheaperNearbySystems(graph, systemId, indices, index);
      setLoaded({
        key,
        rows: found.flatMap(({ systemId: id, jumps, index: value }) => {
          const system = systems.get(id);
          return system
            ? [{ id, name: system.name, security: system.security, jumps, index: value }]
            : [];
        }),
      });
    })();
    return () => {
      live = false;
    };
  }, [key, systemId, activity, index]);
  // Rows from a previous system or activity are never shown under a new one.
  return loaded?.key === key ? loaded.rows : [];
}
