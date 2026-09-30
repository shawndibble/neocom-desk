/**
 * Route Safety's data (issue #2328): the local stargate route between two
 * systems, each system on it joined to the last hour of ESI activity.
 *
 * Four outcomes besides a route, each its own message on the page:
 * - `incomplete`: From or To is not picked yet;
 * - `same-system`: nothing to fly;
 * - `no-route`: no stargate connects them — a fact about New Eden;
 * - `unknown`: the stargate snapshot could not be read — this app cannot say.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  buildRouteSafetyRows,
  summarizeRouteSafety,
  type RouteSafetyRow,
  type RouteSafetySummary,
  type RouteSafetySystemEntry,
} from '@/engine/route/routeSafety';
import { findLocalRoute, type LocalRouteResult } from '@/features/route/localRoute';
import type { RouteQuery } from '@/features/route/routeRules';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { loadRouteRegionNames, loadSystemActivity, type SystemActivity } from './routeSafetyData';

export type RouteSafetyState =
  | { kind: 'incomplete' }
  | { kind: 'same-system' }
  | { kind: 'loading' }
  | { kind: 'no-route' }
  | { kind: 'unknown' }
  | {
      kind: 'route';
      rows: RouteSafetyRow[];
      summary: RouteSafetySummary;
      /** `null` while the activity feeds load, and when neither could be read. */
      fetchedAt: Date | null;
      activityLoading: boolean;
      /** A feed could not be read: its figures show as unknown, never zero. */
      activityUnavailable: boolean;
    };

interface ResolvedRoute {
  requestKey: string;
  result: LocalRouteResult;
  systems: ReadonlyMap<number, RouteSafetySystemEntry>;
  regionNames: ReadonlyMap<number, string>;
}

const NO_SYSTEMS: ReadonlyMap<number, RouteSafetySystemEntry> = new Map();

export function useRouteSafety(
  fromId: number | null,
  toId: number | null,
  route: RouteQuery
): RouteSafetyState {
  const [activity, setActivity] = useState<SystemActivity | null>(null);
  const [resolved, setResolved] = useState<ResolvedRoute | null>(null);
  const { rules, key: routeKey, hydrated } = route;
  const requestKey = `${fromId}:${toId}:${routeKey}`;
  const wantsRoute = fromId !== null && toId !== null && fromId !== toId;

  // Re-read per route, not once per mount: inside the cache window it is a
  // local read, and past it (ESI refreshes hourly) or after a failed feed it
  // is the retry a page left open needs. The last answer stays on screen
  // until the new one lands.
  useEffect(() => {
    if (!wantsRoute) return;
    let cancelled = false;
    void loadSystemActivity().then((next) => {
      if (!cancelled) setActivity(next);
    });
    return () => {
      cancelled = true;
    };
  }, [wantsRoute, requestKey]);

  useEffect(() => {
    // Held until the Avoided Systems are in, so the route is not drawn once without them.
    if (!wantsRoute || !hydrated) return;
    let cancelled = false;
    void (async () => {
      const [result, systems] = await Promise.all([
        findLocalRoute(fromId, toId, rules),
        loadSolarSystemsById().catch(() => null),
      ]);
      const byId = systems ?? NO_SYSTEMS;
      const regionIds =
        result.kind === 'route'
          ? result.systems.flatMap((id) => {
              const regionId = byId.get(id)?.regionId;
              return regionId === undefined ? [] : [regionId];
            })
          : [];
      const regionNames = await loadRouteRegionNames(regionIds);
      if (!cancelled) setResolved({ requestKey, result, systems: byId, regionNames });
    })();
    return () => {
      cancelled = true;
    };
    // `requestKey` stands for `rules`: it changes exactly when they do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsRoute, hydrated, fromId, toId, requestKey]);

  return useMemo((): RouteSafetyState => {
    if (fromId === null || toId === null) return { kind: 'incomplete' };
    if (fromId === toId) return { kind: 'same-system' };
    if (resolved?.requestKey !== requestKey) return { kind: 'loading' };
    const { result } = resolved;
    if (result.kind !== 'route') return { kind: result.kind };
    const rows = buildRouteSafetyRows(result.systems, {
      systems: resolved.systems,
      regionNames: resolved.regionNames,
      kills: activity?.kills ?? null,
      jumps: activity?.jumps ?? null,
    });
    return {
      kind: 'route',
      rows,
      summary: summarizeRouteSafety(rows),
      fetchedAt: activity?.fetchedAt ?? null,
      activityLoading: activity === null,
      activityUnavailable:
        activity !== null && (activity.kills === null || activity.jumps === null),
    };
  }, [fromId, toId, resolved, requestKey, activity]);
}
