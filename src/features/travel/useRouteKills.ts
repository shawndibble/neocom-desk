/**
 * Route Safety's zKillboard column (issue #2329): each route system's last
 * hour of player kills, filled in row by row without holding up the page.
 *
 * zKillboard answers one system per request, so the route is walked at low
 * concurrency, nearest the start first. A row that fails (a 429 included)
 * says so on its own and the walk carries on.
 */
import { useEffect, useState } from 'react';
import { summarizeRecentKills, type RecentKillsSummary } from '@/engine/route/recentKills';
import type { SecurityBand } from '@/engine/securityStatus';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import {
  RECENT_KILLS_TTL_MS,
  loadSystemRecentKills,
  loadTypeGroups,
  resolveKillLocations,
} from './routeKillsData';

/** Low on purpose: zKillboard is a third party that rate-limits hard. */
export const ZKILL_CONCURRENCY = 3;

export type RouteKillsCell =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; summary: RecentKillsSummary };

export interface RouteKillsSystem {
  systemId: number;
  band: SecurityBand | null;
}

const LOADING: RouteKillsCell = { status: 'loading' };

/** `route` in flight order; `null` while there is no route to read. */
export function useRouteKills(
  route: readonly RouteKillsSystem[] | null
): (systemId: number) => RouteKillsCell {
  const [cells, setCells] = useState<{ key: string; bySystem: Map<number, RouteKillsCell> }>({
    key: '',
    bySystem: new Map(),
  });
  // Re-walk once the cache has gone stale, so a page left open keeps its
  // counts and "min ago" current instead of freezing at the first look.
  const [refresh, setRefresh] = useState(0);
  const hasRoute = route !== null;
  useEffect(() => {
    if (!hasRoute) return;
    const timer = setInterval(() => setRefresh((n) => n + 1), RECENT_KILLS_TTL_MS);
    return () => clearInterval(timer);
  }, [hasRoute]);

  // The route itself is the key, so a re-render that rebuilds an equal route
  // (the activity feeds landing) does not restart the walk.
  const key = route ? JSON.stringify(route.map((system) => [system.systemId, system.band])) : '';

  useEffect(() => {
    if (key === '') return;
    const systems = (JSON.parse(key) as [number, SecurityBand | null][]).map(
      ([systemId, band]): RouteKillsSystem => ({ systemId, band })
    );
    if (systems.length === 0) return;
    let cancelled = false;
    const set = (systemId: number, cell: RouteKillsCell) => {
      if (cancelled) return;
      setCells((previous) => {
        const bySystem = new Map(previous.key === key ? previous.bySystem : undefined);
        bySystem.set(systemId, cell);
        return { key, bySystem };
      });
    };

    // Read alongside the first zKillboard requests, never ahead of them.
    const groups = loadTypeGroups();
    void (async () => {
      await mapWithConcurrencyLimit(
        systems.map((system, index) => ({ system, index })),
        ZKILL_CONCURRENCY,
        async ({ system, index }) => {
          if (cancelled) return;
          const result = await loadSystemRecentKills(system.systemId);
          if (!result.ok) {
            set(system.systemId, { status: 'unavailable' });
            return;
          }
          const groupOf = await groups;
          const locations = await resolveKillLocations(
            result.kills.flatMap((kill) => (kill.locationId === null ? [] : [kill.locationId]))
          );
          const pathNeighbours = new Set(
            [systems[index - 1], systems[index + 1]].flatMap((neighbour) =>
              neighbour ? [neighbour.systemId] : []
            )
          );
          set(system.systemId, {
            status: 'ready',
            summary: summarizeRecentKills(result.kills, {
              groupOf,
              band: system.band,
              locations,
              pathNeighbours,
              now: Date.now(),
            }),
          });
        }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [key, refresh]);

  return (systemId) => (cells.key === key ? cells.bySystem.get(systemId) : undefined) ?? LOADING;
}
