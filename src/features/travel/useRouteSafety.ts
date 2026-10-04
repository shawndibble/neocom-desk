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
 */
import { useEffect, useMemo, useState } from 'react';
import type { RouteSafetySystemEntry } from '@/engine/route/routeSafety';
import {
  assembleRouteSafety,
  planLegAlternatives,
  routeSafetyNetwork,
  type LegAlternatives,
  type RouteSafetyAssembly,
} from '@/engine/route/routeSafetyTrip';
import type { HoleNetwork } from '@/engine/route/routeHoles';
import type { TheraConnection } from '@/engine/route/theraConnections';
import type { AnsiblexGate } from '@/engine/route/ansiblex';
import type { TripOptions } from '@/engine/route/tripPlan';
import { planLocalTrip, type LocalTripResult } from '@/features/route/localRoute';
import type { RouteQuery } from '@/features/route/routeRules';
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
export type {
  LegPinNote,
  RouteSafetyLeg,
  RouteSafetyTrip,
  RouteSafetyWay,
  RouteSafetyWayBridge,
  RouteSafetyWayHole,
} from '@/engine/route/routeSafetyTrip';

export type RouteSafetyState =
  | { kind: 'incomplete' }
  | { kind: 'same-system' }
  | { kind: 'loading' }
  | { kind: 'no-route' }
  | { kind: 'unknown' }
  | (Extract<RouteSafetyAssembly, { kind: 'route' }> & {
      /** The holes and bridges the route was planned with, for an Avoid preview to plan the same way. */
      network: HoleNetwork;
      networkKey: string;
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
  const network = useMemo(
    () => routeSafetyNetwork(holeEndsFromKey(holesKey), bridgeEndsFromKey(bridgesKey)),
    [holesKey, bridgesKey]
  );
  const listedById = useMemo(
    () => (listed === null ? null : new Map(listed.map((hole) => [hole.id, hole]))),
    [listed]
  );
  const pinKey = pinsKey(pins, listedById);
  const requestKey = `${fromId}:${stopsKey}:${optimize}:${returnToStart}:${keepLastStopLast}:${routeKey}:${networkKey}:${pinKey}`;
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
      let alternatives: LegAlternatives[] = [];
      let systemIds: number[] = [];
      if (result.kind === 'trip') {
        ({ legs: alternatives, systemIds } = planLegAlternatives(
          result,
          { holes: holeEndsFromKey(holesKey), bridges: bridgeEndsFromKey(bridgesKey) },
          pinsFromKey(pinKey)
        ));
      }
      const regionIds = new Set(systemIds.flatMap((id) => byId.get(id)?.regionId ?? []));
      const regionNames = await loadRouteRegionNames([...regionIds]);
      if (!cancelled) {
        setResolved({ requestKey, result, alternatives, systems: byId, regionNames });
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
    holesKey,
    bridgesKey,
    pinKey,
    requestKey,
  ]);

  return useMemo((): RouteSafetyState => {
    if (fromId === null || stops.length === 0) return { kind: 'incomplete' };
    if (stops.length === 1 && stops[0] === fromId) return { kind: 'same-system' };
    if (resolved?.requestKey !== requestKey) return { kind: 'loading' };
    const { result } = resolved;
    if (result.kind === 'unknown') return result;
    const assembled = assembleRouteSafety({
      trip: result,
      alternatives: resolved.alternatives,
      stops,
      pins,
      holes,
      listed,
      bridges,
      systems: resolved.systems,
      regionNames: resolved.regionNames,
      activity,
    });
    return assembled.kind === 'route' ? { ...assembled, network, networkKey } : assembled;
  }, [
    bridges,
    fromId,
    stops,
    resolved,
    requestKey,
    activity,
    holes,
    network,
    networkKey,
    pins,
    listed,
  ]);
}
