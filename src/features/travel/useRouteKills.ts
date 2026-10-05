/**
 * Route Safety's zKillboard column (issue #2329): each route system's last
 * hour of player kills, filled in row by row without holding up the page.
 *
 * zKillboard answers one system or one region per request, and no longer takes
 * a list of ids. A route crosses far fewer regions than systems, so it is
 * walked region by region at low concurrency, nearest the start first, and one
 * answer fills every route system in that region. A system whose region is
 * unknown asks on its own. A row that fails (a 429 included) says so and the
 * walk carries on.
 */
import { useEffect, useState } from 'react';
import {
  summarizeRecentKills,
  type RecentKill,
  type RecentKillsSummary,
} from '@/engine/route/recentKills';
import type { SecurityBand } from '@/engine/securityStatus';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import {
  RECENT_KILLS_TTL_MS,
  loadRegionRecentKills,
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

/** A route system and its place in flight order. */
interface WalkRow {
  system: RouteKillsSystem;
  index: number;
}

/** One zKillboard request: a region's rows, or (no known region) a single system's. */
interface WalkStep {
  regionId: number | null;
  rows: WalkRow[];
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
    const regions = loadSolarSystemsById();
    const fillRow = async ({ system, index }: WalkRow, kills: readonly RecentKill[]) => {
      const groupOf = await groups;
      const locations = await resolveKillLocations(
        kills.flatMap((kill) => (kill.locationId === null ? [] : [kill.locationId]))
      );
      const pathNeighbours = new Set(
        [systems[index - 1], systems[index + 1]].flatMap((neighbour) =>
          neighbour ? [neighbour.systemId] : []
        )
      );
      set(system.systemId, {
        status: 'ready',
        summary: summarizeRecentKills(kills, {
          groupOf,
          band: system.band,
          locations,
          pathNeighbours,
          now: Date.now(),
        }),
      });
    };
    void (async () => {
      const regionOf = await regions;
      // One step per region, in order of first appearance; a system with no
      // known region is a step of its own.
      const steps: WalkStep[] = [];
      const byRegion = new Map<number, WalkStep>();
      systems.forEach((system, index) => {
        const row = { system, index };
        const regionId = regionOf?.get(system.systemId)?.regionId ?? null;
        const known = regionId === null ? undefined : byRegion.get(regionId);
        if (known) {
          known.rows.push(row);
          return;
        }
        const step = { regionId, rows: [row] };
        steps.push(step);
        if (regionId !== null) byRegion.set(regionId, step);
      });
      await mapWithConcurrencyLimit(steps, ZKILL_CONCURRENCY, async ({ regionId, rows }) => {
        if (cancelled) return;
        // Each row's kills, or null when zKillboard could not answer.
        let killsOf: ((systemId: number) => readonly RecentKill[]) | null;
        if (regionId === null) {
          const result = await loadSystemRecentKills(rows[0].system.systemId);
          killsOf = result.ok ? () => result.kills : null;
        } else {
          const result = await loadRegionRecentKills(regionId);
          killsOf = result.ok ? (systemId) => result.bySystem.get(systemId) ?? [] : null;
        }
        for (const row of rows) {
          if (cancelled) return;
          if (killsOf) await fillRow(row, killsOf(row.system.systemId));
          else set(row.system.systemId, { status: 'unavailable' });
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, refresh]);

  return (systemId) => (cells.key === key ? cells.bySystem.get(systemId) : undefined) ?? LOADING;
}
