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
 * This hook is the adapter (issue #2539): it loads the stargate graph,
 * systems, region names and activity, drops answers a newer request made
 * stale, and names its inputs (`routeSafetyKeys.ts`) so the trip is planned
 * again only when the network or a pin's answer changes — never as the holes'
 * remaining life ticks down. What the trip is made of — each leg's Ways to
 * fly, its pin, the hole and bridge jumps, the trip's facts — is
 * `engine/route/routeSafetyTrip.ts`.
 *
 * Holes (issue #2476) and Ansiblex (issue #2478) join the search as extra
 * connections; the stargate graph never holds them, so waypoints still cut at
 * a hole or a bridge.
 *
 * An Avoid preview (issue #2547) is this same trip request with one more
 * system avoided: `planWithAvoid` runs it through the same planner and
 * assembly — pins, holes, bridges and Optimize included — reading only the
 * graph and systems already loaded, and saving nothing.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RouteSafetySystemEntry } from '@/engine/route/routeSafety';
import {
  assembleRouteSafety,
  planLegAlternatives,
  routeSafetyNetwork,
  type LegAlternatives,
  type RouteSafetyAssembly,
} from '@/engine/route/routeSafetyTrip';
import type { HoleEnds, HoleNetwork } from '@/engine/route/routeHoles';
import type { TheraConnection } from '@/engine/route/theraConnections';
import type { AnsiblexGate } from '@/engine/route/ansiblex';
import type { TripOptions } from '@/engine/route/tripPlan';
import { planLocalTrip, type LocalTripResult } from '@/features/route/localRoute';
import type { RouteQuery, RouteRules } from '@/features/route/routeRules';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { loadRouteRegionNames, loadSystemActivity, type SystemActivity } from './routeSafetyData';
import {
  bridgeEndsFromKey,
  bridgeKey,
  holeEndsFromKey,
  holeNetworkKey,
  pinsFromKey,
  pinsKey,
} from './routeSafetyKeys';

export type { BridgeAt } from '@/engine/route/ansiblex';
export type { HoleAt } from '@/engine/route/routeHoles';
export type { RouteSafetyLeg, RouteSafetyWay } from '@/engine/route/routeSafetyTrip';

/** The trip as an Avoid preview would draw it: `unknown` when the stargate map cannot be read. */
export type AvoidTripResult = RouteSafetyAssembly | { kind: 'unknown' };

export type RouteSafetyState =
  | { kind: 'incomplete' }
  | { kind: 'same-system' }
  | { kind: 'loading' }
  | { kind: 'no-route' }
  | { kind: 'unknown' }
  | (Extract<RouteSafetyAssembly, { kind: 'route' }> & {
      /**
       * This trip, re-planned with `avoid` in place of the rules' own avoid
       * list — everything else as drawn. Saves nothing; a new function
       * whenever the trip request changes.
       */
      planWithAvoid: (avoid: readonly number[]) => Promise<AvoidTripResult>;
    });

export interface RouteSafetyRequest {
  fromId: number | null;
  stops: readonly number[];
  tripOptions: TripOptions;
  route: RouteQuery;
  /** The open Thera / Turnur holes the filters allow (`useRouteHoles`). */
  holes?: readonly TheraConnection[];
  /** Each leg's pin token (`routeSafetyLink.ts`), `''` for a leg flown as planned. */
  pins?: readonly string[];
  /** Every open hole EVE-Scout lists, or `null` while there is no list (Hole jumps off, loading, unreachable). */
  listed?: readonly TheraConnection[] | null;
  /** The known Ansiblex the route may cross, or `null` while Use jump bridges is off. */
  bridges?: readonly AnsiblexGate[] | null;
}

interface ResolvedTrip {
  requestKey: string;
  result: LocalTripResult;
  alternatives: LegAlternatives[];
  systems: ReadonlyMap<number, RouteSafetySystemEntry>;
  regionNames: ReadonlyMap<number, string>;
}

const NO_HOLES: readonly TheraConnection[] = [];
const NO_PINS: readonly string[] = [];
const NO_SYSTEMS: ReadonlyMap<number, RouteSafetySystemEntry> = new Map();
const NO_REGION_NAMES: ReadonlyMap<number, string> = new Map();

/** One planned trip with its legs' other ways: what the page and an Avoid preview both assemble. */
async function planRouteSafetyTrip(request: {
  fromId: number;
  stops: readonly number[];
  rules: RouteRules;
  tripOptions: TripOptions;
  network: HoleNetwork;
  networkEnds: { holes: readonly HoleEnds[]; bridges: readonly AnsiblexGate[] };
  pins: Parameters<typeof planLegAlternatives>[2];
}): Promise<{
  result: LocalTripResult;
  alternatives: LegAlternatives[];
  systemIds: number[];
  systems: ReadonlyMap<number, RouteSafetySystemEntry>;
}> {
  const [result, systems] = await Promise.all([
    planLocalTrip(
      request.fromId,
      request.stops,
      request.rules,
      request.tripOptions,
      request.network
    ),
    loadSolarSystemsById().catch(() => null),
  ]);
  if (result.kind !== 'trip') {
    return { result, alternatives: [], systemIds: [], systems: systems ?? NO_SYSTEMS };
  }
  const { legs, systemIds } = planLegAlternatives(result, request.networkEnds, request.pins);
  return { result, alternatives: legs, systemIds, systems: systems ?? NO_SYSTEMS };
}

export function useRouteSafety({
  fromId,
  stops,
  tripOptions,
  route,
  holes = NO_HOLES,
  pins = NO_PINS,
  listed = null,
  bridges = null,
}: RouteSafetyRequest): RouteSafetyState {
  const [activity, setActivity] = useState<SystemActivity | null>(null);
  const [resolved, setResolved] = useState<ResolvedTrip | null>(null);
  const { rules, key: routeKey, hydrated } = route;
  const { optimize = false, returnToStart = false, keepLastStopLast = false } = tripOptions;
  const stopsKey = stops.join(',');
  const holesKey = holeNetworkKey(holes);
  const bridgesKey = bridges === null ? '' : bridgeKey(bridges);
  const networkKey = bridgesKey === '' ? holesKey : `${holesKey}|${bridgesKey}`;
  // Just the ends: the holes' life and the bridges' names never re-plan the trip.
  const { networkEnds, network } = useMemo(() => {
    const ends = { holes: holeEndsFromKey(holesKey), bridges: bridgeEndsFromKey(bridgesKey) };
    return { networkEnds: ends, network: routeSafetyNetwork(ends.holes, ends.bridges) };
  }, [holesKey, bridgesKey]);
  const listedById = useMemo(
    () => (listed === null ? null : new Map(listed.map((hole) => [hole.id, hole]))),
    [listed]
  );
  const pinRequestKey = pinsKey(pins, listedById);
  const requestKey = `${fromId}:${stopsKey}:${optimize}:${returnToStart}:${keepLastStopLast}:${routeKey}:${networkKey}:${pinRequestKey}`;
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
      const { result, alternatives, systemIds, systems } = await planRouteSafetyTrip({
        fromId,
        stops: stopIds,
        rules,
        tripOptions: { optimize, returnToStart, keepLastStopLast },
        network,
        networkEnds,
        pins: pinsFromKey(pinRequestKey),
      });
      const regionIds = new Set(systemIds.flatMap((id) => systems.get(id)?.regionId ?? []));
      const regionNames = await loadRouteRegionNames([...regionIds]);
      if (!cancelled) {
        setResolved({ requestKey, result, alternatives, systems, regionNames });
      }
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
    networkEnds,
    pinRequestKey,
    requestKey,
  ]);

  // The same request with the avoid list swapped. No region names or
  // activity: a preview reads jumps and security only, and asks no network.
  const planWithAvoid = useCallback(
    async (avoid: readonly number[]): Promise<AvoidTripResult> => {
      if (fromId === null) return { kind: 'unknown' };
      const stopIds = stopsKey.split(',').map(Number);
      const planned = await planRouteSafetyTrip({
        fromId,
        stops: stopIds,
        rules: { ...rules, avoid: [...avoid] },
        tripOptions: { optimize, returnToStart, keepLastStopLast },
        network,
        networkEnds,
        pins: pinsFromKey(pinRequestKey),
      });
      if (planned.result.kind === 'unknown') return planned.result;
      return assembleRouteSafety({
        planned: planned.result,
        alternatives: planned.alternatives,
        singleStop: stopIds.length === 1,
        pins,
        holes,
        listed,
        bridges,
        systems: planned.systems,
        regionNames: NO_REGION_NAMES,
        activity: null,
      });
    },
    [
      fromId,
      stopsKey,
      rules,
      optimize,
      returnToStart,
      keepLastStopLast,
      network,
      networkEnds,
      pinRequestKey,
      pins,
      holes,
      listed,
      bridges,
    ]
  );

  return useMemo((): RouteSafetyState => {
    if (fromId === null || stops.length === 0) return { kind: 'incomplete' };
    if (stops.length === 1 && stops[0] === fromId) return { kind: 'same-system' };
    if (resolved?.requestKey !== requestKey) return { kind: 'loading' };
    const { result } = resolved;
    if (result.kind === 'unknown') return result;
    const assembled = assembleRouteSafety({
      planned: result,
      alternatives: resolved.alternatives,
      singleStop: stops.length === 1,
      pins,
      holes,
      listed,
      bridges,
      systems: resolved.systems,
      regionNames: resolved.regionNames,
      activity,
    });
    return assembled.kind === 'route' ? { ...assembled, planWithAvoid } : assembled;
  }, [bridges, fromId, stops, resolved, requestKey, activity, holes, planWithAvoid, pins, listed]);
}
