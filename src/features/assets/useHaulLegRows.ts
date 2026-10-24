import { useEffect, useState } from 'react';
import { buildRouteSafetyRows, type RouteSafetyRow } from '@/engine/route/routeSafety';
import type { HaulLeg } from '@/engine/route/haulPlan';
import { loadJumpBasis } from '@/features/route/jumpBasis';
import { findLocalRoute } from '@/features/route/localRoute';
import { loadSystemActivity } from '@/features/route/routeSafetyData';
import { loadSolarSystemsById } from '@/sde/solarSystems';

/** A Leg's systems in flying order, read for the strip; `none` when no gate route can be drawn. */
export type LegRows = { status: 'ready'; rows: RouteSafetyRow[] } | { status: 'none' };

/**
 * The systems each Leg flies through, re-derived under the saved Jump Basis
 * (the haul snapshot keeps jump counts only), with the last hour's kills.
 * Both activity feeds are one cached call each for all of New Eden, so a
 * haul of any size costs the same two requests. Absent until read.
 */
export function useHaulLegRows(legs: readonly HaulLeg[]): ReadonlyMap<number, LegRows> {
  const [rows, setRows] = useState<ReadonlyMap<number, LegRows>>(new Map());
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [basis, systems, activity] = await Promise.all([
        loadJumpBasis(),
        loadSolarSystemsById().catch(() => null),
        loadSystemActivity(),
      ]);
      const read = await Promise.all(
        legs.map(async (leg): Promise<[number, LegRows]> => {
          const from = leg.from?.systemId ?? null;
          const to = leg.to.systemId;
          if (from === null || to === null || !systems) return [leg.id, { status: 'none' }];
          const route = await findLocalRoute(from, to, basis.rules, basis.network);
          if (route.kind !== 'route') return [leg.id, { status: 'none' }];
          return [
            leg.id,
            {
              status: 'ready',
              rows: buildRouteSafetyRows(route.systems, {
                systems,
                regionNames: new Map(),
                kills: activity.kills,
                jumps: activity.jumps,
              }),
            },
          ];
        })
      );
      if (!cancelled) setRows(new Map(read));
    })();
    return () => {
      cancelled = true;
    };
  }, [legs]);
  return rows;
}
