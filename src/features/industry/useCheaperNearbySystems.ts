import { useEffect, useState } from 'react';
import type { IndustryActivity } from '@/engine/industry/types';
import { cheaperNearbySystems } from '@/engine/industry/cheaperNearbySystems';
import { securityBand } from '@/engine/securityStatus';
import { loadJumpGraph } from '@/sde/jumpGraph';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { loadNpcIndustrySystems } from '@/market/industryFacilities';
import { loadSystemCostIndices } from './marketData';

export interface NearbyCostIndex {
  id: number;
  name: string;
  security: number;
  jumps: number;
  index: number;
  /**
   * True when the list confirmed an NPC station running industry jobs there.
   * False for a reaction plan and when the list could not be read, so a move
   * keeps the plan's facility.
   */
  npcStation: boolean;
}

/**
 * The 5 cheapest systems within 5 jumps whose index for `activity` beats
 * `index`, cheapest first, that have an NPC station running industry jobs
 * (reactions need a structure, which cannot be checked, so they are not
 * filtered). Empty while loading, on a failed read, when none
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
      const [graph, systems, indices, npcSystems] = await Promise.all([
        loadJumpGraph().catch(() => undefined),
        loadSolarSystemsById().catch(() => null),
        loadSystemCostIndices(activity).catch(() => null),
        activity === 'reaction' ? Promise.resolve(null) : loadNpcIndustrySystems(),
      ]);
      if (!live || !graph || !systems || !indices) return;
      // Reactions cannot run in highsec, so a highsec system is no saving for one.
      const found = cheaperNearbySystems(graph, systemId, indices, index, {
        isEligible: npcSystems ? (id) => npcSystems.has(id) : undefined,
      }).filter(({ systemId: id }) => {
        const security = systems.get(id)?.security;
        return (
          activity !== 'reaction' || security === undefined || securityBand(security) !== 'highsec'
        );
      });
      setLoaded({
        key,
        rows: found.flatMap(({ systemId: id, jumps, index: value }) => {
          const system = systems.get(id);
          return system
            ? [
                {
                  id,
                  name: system.name,
                  security: system.security,
                  jumps,
                  index: value,
                  npcStation: npcSystems?.has(id) ?? false,
                },
              ]
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
