/**
 * Route Safety's data (issue #2328): the local stargate route from a start
 * through one or more Stops (issue #2475), each system on it joined to the
 * last hour of ESI activity.
 *
 * Four outcomes besides a route, each its own message on the page:
 * - `incomplete`: From or a stop is not picked yet;
 * - `same-system`: one stop, and it is where you are — nothing to fly;
 * - `no-route`: one stop no stargate reaches — a fact about New Eden;
 * - `unknown`: the stargate snapshot could not be read — this app cannot say.
 *
 * With several stops an unreachable stop is a fact about its legs, not the
 * whole trip: the other legs still draw, and that leg carries its own
 * no-route message.
 *
 * Holes (issue #2476): the caller passes the open Thera / Turnur holes the
 * route may cross (`useRouteHoles`), and they join the graph as extra
 * connections with the hubs free (`engine/route/routeHoles.ts`). The trip is
 * planned again only when the network they make changes, never as their
 * remaining life ticks down.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  buildRouteSafetyRows,
  joinLegs,
  summarizeRouteSafety,
  summarizeTrip,
  type RouteSafetyRow,
  type RouteSafetySummary,
  type RouteSafetySystemEntry,
} from '@/engine/route/routeSafety';
import type { JumpGraph } from '@/engine/route/jumpRoute';
import {
  holeBetween,
  holeNetworkFromKey,
  holeNetworkKey,
  type HoleNetwork,
} from '@/engine/route/routeHoles';
import type { TheraConnection } from '@/engine/route/theraConnections';
import type { TripOptions, TripPlan } from '@/engine/route/tripPlan';
import { planLocalTrip, type LocalTripResult } from '@/features/route/localRoute';
import type { RouteQuery } from '@/features/route/routeRules';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { loadRouteRegionNames, loadSystemActivity, type SystemActivity } from './routeSafetyData';

/** One Leg of the trip: its rows and facts, or `null` for both when no stargate route flies it. */
export interface RouteSafetyLeg {
  from: number;
  to: number;
  rows: RouteSafetyRow[] | null;
  summary: RouteSafetySummary | null;
}

/** The whole trip as one route: what the facts line and strip cover. */
export interface RouteSafetyTrip {
  rows: RouteSafetyRow[];
  /** Where along `rows` each leg ends. */
  stopIndexes: number[];
  summary: RouteSafetySummary;
  /** How many of the trip's jumps go through a wormhole; the rest are by gate. */
  holeJumps: number;
}

/** The hole a step between two systems crosses, or `null` for a stargate jump. */
export type HoleAt = (from: number, to: number) => TheraConnection | null;

export type RouteSafetyState =
  | { kind: 'incomplete' }
  | { kind: 'same-system' }
  | { kind: 'loading' }
  | { kind: 'no-route' }
  | { kind: 'unknown' }
  | {
      kind: 'route';
      legs: RouteSafetyLeg[];
      /** `null` when a leg has no route: there is no whole trip to sum. */
      trip: RouteSafetyTrip | null;
      /** Set when optimizing changed the stop order. */
      reordered: TripPlan['reordered'];
      /** A stop no stargate route reaches: optimizing is off until it is removed. */
      unreachable: boolean;
      /** `null` while the activity feeds load, and when neither could be read. */
      fetchedAt: Date | null;
      activityLoading: boolean;
      /** A feed could not be read: its figures show as unknown, never zero. */
      activityUnavailable: boolean;
      holeAt: HoleAt;
      /** The holes the route was planned with, for an Avoid preview to plan the same way. */
      network: HoleNetwork;
      networkKey: string;
    };

interface ResolvedTrip {
  requestKey: string;
  result: LocalTripResult;
  systems: ReadonlyMap<number, RouteSafetySystemEntry>;
  regionNames: ReadonlyMap<number, string>;
}

const NO_HOLES: readonly TheraConnection[] = [];

const NO_SYSTEMS: ReadonlyMap<number, RouteSafetySystemEntry> = new Map();

export function useRouteSafety(
  fromId: number | null,
  stops: readonly number[],
  tripOptions: TripOptions,
  route: RouteQuery,
  holes: readonly TheraConnection[] = NO_HOLES
): RouteSafetyState {
  const [activity, setActivity] = useState<SystemActivity | null>(null);
  const [resolved, setResolved] = useState<ResolvedTrip | null>(null);
  const { rules, key: routeKey, hydrated } = route;
  const { optimize = false, returnToStart = false, keepLastStopLast = false } = tripOptions;
  const stopsKey = stops.join(',');
  const networkKey = holeNetworkKey(holes);
  const network = useMemo(() => holeNetworkFromKey(networkKey), [networkKey]);
  const requestKey = `${fromId}:${stopsKey}:${optimize}:${returnToStart}:${keepLastStopLast}:${routeKey}:${networkKey}`;
  const wantsRoute =
    fromId !== null && stops.length > 0 && !(stops.length === 1 && stops[0] === fromId);

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
    const stopIds = stopsKey.split(',').map(Number);
    void (async () => {
      const [result, systems] = await Promise.all([
        planLocalTrip(
          fromId,
          stopIds,
          rules,
          { optimize, returnToStart, keepLastStopLast },
          network
        ),
        loadSolarSystemsById().catch(() => null),
      ]);
      const byId = systems ?? NO_SYSTEMS;
      const regionIds = new Set<number>();
      if (result.kind === 'trip') {
        for (const leg of result.plan.legs) {
          if (leg.route.kind !== 'route') continue;
          for (const id of leg.route.systems) {
            const regionId = byId.get(id)?.regionId;
            if (regionId !== undefined) regionIds.add(regionId);
          }
        }
      }
      const regionNames = await loadRouteRegionNames([...regionIds]);
      if (!cancelled) setResolved({ requestKey, result, systems: byId, regionNames });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    wantsRoute,
    hydrated,
    fromId,
    stopsKey,
    optimize,
    returnToStart,
    keepLastStopLast,
    rules,
    network,
    requestKey,
  ]);

  return useMemo((): RouteSafetyState => {
    if (fromId === null || stops.length === 0) return { kind: 'incomplete' };
    if (stops.length === 1 && stops[0] === fromId) return { kind: 'same-system' };
    if (resolved?.requestKey !== requestKey) return { kind: 'loading' };
    const { result } = resolved;
    if (result.kind === 'unknown') return result;
    const { plan, graph } = result;
    const holeAt = holeStepFinder(graph, holes);
    // One stop is the page as it always was: no route is the whole answer.
    if (stops.length === 1 && plan.legs[0]?.route.kind !== 'route') return { kind: 'no-route' };
    const inputs = {
      systems: resolved.systems,
      regionNames: resolved.regionNames,
      kills: activity?.kills ?? null,
      jumps: activity?.jumps ?? null,
    };
    const legs = plan.legs.map((leg): RouteSafetyLeg => {
      if (leg.route.kind !== 'route') {
        return { from: leg.from, to: leg.to, rows: null, summary: null };
      }
      const rows = buildRouteSafetyRows(leg.route.systems, inputs);
      return { from: leg.from, to: leg.to, rows, summary: summarizeRouteSafety(rows) };
    });
    const legRows = legs.flatMap((leg) => (leg.rows ? [leg.rows] : []));
    const joined = joinLegs(legRows);
    return {
      kind: 'route',
      legs,
      trip:
        legRows.length === legs.length
          ? {
              rows: joined.rows,
              stopIndexes: joined.stopIndexes,
              summary: summarizeTrip(legRows),
              holeJumps: joined.rows.filter(
                (row, index) => index > 0 && holeAt(joined.rows[index - 1].systemId, row.systemId)
              ).length,
            }
          : null,
      reordered: plan.reordered,
      unreachable: plan.unreachable,
      fetchedAt: activity?.fetchedAt ?? null,
      activityLoading: activity === null,
      activityUnavailable:
        activity !== null && (activity.kills === null || activity.jumps === null),
      holeAt,
      network,
      networkKey,
    };
  }, [fromId, stops, resolved, requestKey, activity, holes, network, networkKey]);
}

/**
 * One answer to "was this step a hole?" for the table, the strip, the facts
 * and the folds alike: a hole joins the two systems and no stargate does —
 * Turnur has gates, and a gate to the same neighbour is the jump flown.
 */
function holeStepFinder(graph: JumpGraph, holes: readonly TheraConnection[]): HoleAt {
  if (holes.length === 0) return () => null;
  return (from, to) => (graph.get(from)?.includes(to) ? null : holeBetween(holes, from, to));
}
