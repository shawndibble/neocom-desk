import { useCallback, useEffect, useMemo, useState } from 'react';
import { candidateAvoid } from '@/engine/route/avoidRules';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import type { PreferenceRoute } from '@/engine/route/routePreferenceCards';
import type { RouteSafetySystemEntry } from '@/engine/route/routeSafety';
import {
  assembleRouteSafety,
  gatesOverLongerHoles,
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
import type { RouteJumpSetup } from '@/features/route/routeJumpSettings';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { useLawlessSystems } from './useLawlessSystems';
import {
  loadRouteRegionNames,
  loadSystemActivity,
  type SystemActivity,
} from '@/features/route/routeSafetyData';
import {
  bridgeEndsFromKey,
  bridgeKey,
  holeEndsFromKey,
  holeNetworkKey,
  pinsFromKey,
  pinsKey,
} from '@/features/route/routeSafetyKeys';

export type {
  RouteSafetyLeg,
  RouteSafetyTripRow,
  RouteSafetyWay,
} from '@/engine/route/routeSafetyTrip';

export type AvoidTripResult = RouteSafetyAssembly | { kind: 'unknown' };

export type AvoidAddition = Omit<Parameters<typeof candidateAvoid>[0], 'effective'>;

export type RouteSafetyState =
  | { kind: 'incomplete' }
  | { kind: 'same-system' }
  | { kind: 'loading' }
  | { kind: 'no-route' }
  | { kind: 'unknown' }
  | (Extract<RouteSafetyAssembly, { kind: 'route' }> & {
      requestKey: string;
      planWithAvoid: (addition: AvoidAddition) => Promise<AvoidTripResult>;
      planWithPreference: (preference: RoutePreferenceKind) => Promise<PreferenceRoute | null>;
    });

export interface RouteSafetyRequest {
  fromId: number | null;
  stops: readonly number[];
  tripOptions: TripOptions;
  route: RouteQuery;
  holes?: readonly TheraConnection[];
  pins?: readonly string[];
  listed?: readonly TheraConnection[] | null;
  bridges?: readonly AnsiblexGate[] | null;
  jump?: RouteJumpSetup | null;
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

async function planRouteSafetyTrip(request: {
  fromId: number;
  stops: readonly number[];
  rules: RouteRules;
  tripOptions: TripOptions;
  network: HoleNetwork;
  networkEnds: { holes: readonly HoleEnds[]; bridges: readonly AnsiblexGate[] };
  pins: Parameters<typeof planLegAlternatives>[2];
  jump: RouteJumpSetup | null;
}): Promise<{
  result: LocalTripResult;
  alternatives: LegAlternatives[];
  systemIds: number[];
  systems: ReadonlyMap<number, RouteSafetySystemEntry>;
}> {
  const [planned, systems] = await Promise.all([
    planLocalTrip(
      request.fromId,
      request.stops,
      request.rules,
      request.tripOptions,
      request.network
    ),
    loadSolarSystemsById().catch(() => null),
  ]);
  const result = planned.kind === 'trip' ? gatesOverLongerHoles(planned) : planned;
  if (result.kind !== 'trip') {
    return { result, alternatives: [], systemIds: [], systems: systems ?? NO_SYSTEMS };
  }
  const { legs, systemIds } = planLegAlternatives(
    result,
    request.networkEnds,
    request.pins,
    request.jump && { systems: request.jump.systems, drive: request.jump.drive }
  );
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
  jump = null,
}: RouteSafetyRequest): RouteSafetyState {
  const [activity, setActivity] = useState<SystemActivity | null>(null);
  const lawless = useLawlessSystems();
  const [resolved, setResolved] = useState<ResolvedTrip | null>(null);
  const { rules, key: routeKey, hydrated } = route;
  const { optimize = false, returnToStart = false, keepLastStopLast = false } = tripOptions;
  const stopsKey = stops.join(',');
  const holesKey = holeNetworkKey(holes);
  const bridgesKey = bridges === null ? '' : bridgeKey(bridges);
  const networkKey = bridgesKey === '' ? holesKey : `${holesKey}|${bridgesKey}`;
  const { networkEnds, network } = useMemo(() => {
    const ends = { holes: holeEndsFromKey(holesKey), bridges: bridgeEndsFromKey(bridgesKey) };
    return { networkEnds: ends, network: routeSafetyNetwork(ends.holes, ends.bridges) };
  }, [holesKey, bridgesKey]);
  const listedById = useMemo(
    () => (listed === null ? null : new Map(listed.map((hole) => [hole.id, hole]))),
    [listed]
  );
  const pinRequestKey = pinsKey(pins, listedById);
  const requestKey = `${fromId}:${stopsKey}:${optimize}:${returnToStart}:${keepLastStopLast}:${routeKey}:${networkKey}:${pinRequestKey}:${jump?.key ?? ''}`;
  const wantsRoute =
    fromId !== null && stops.length > 0 && !(stops.length === 1 && stops[0] === fromId);

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
        jump,
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
    jump,
  ]);

  const planWithAvoid = useCallback(
    async (addition: AvoidAddition): Promise<AvoidTripResult> => {
      if (fromId === null) return { kind: 'unknown' };
      const stopIds = stopsKey.split(',').map(Number);
      const planned = await planRouteSafetyTrip({
        fromId,
        stops: stopIds,
        rules: { ...rules, avoid: candidateAvoid({ effective: rules.avoid, ...addition }) },
        tripOptions: { optimize, returnToStart, keepLastStopLast },
        network,
        networkEnds,
        pins: pinsFromKey(pinRequestKey),
        jump,
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
        jump,
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
      jump,
    ]
  );

  const planWithPreference = useCallback(
    async (preference: RoutePreferenceKind): Promise<PreferenceRoute | null> => {
      if (fromId === null || resolved === null) return null;
      const stopIds = stopsKey.split(',').map(Number);
      const planned = await planRouteSafetyTrip({
        fromId,
        stops: stopIds,
        rules: { ...rules, preference },
        tripOptions: { optimize, returnToStart, keepLastStopLast },
        network,
        networkEnds,
        pins: pinsFromKey(pinRequestKey),
        jump,
      });
      if (planned.result.kind === 'unknown') return null;
      const assembled = assembleRouteSafety({
        planned: planned.result,
        alternatives: planned.alternatives,
        singleStop: stopIds.length === 1,
        pins,
        holes,
        listed,
        bridges,
        systems: planned.systems,
        regionNames: resolved.regionNames,
        activity,
        lawless,
        jump,
      });
      if (assembled.kind !== 'route' || assembled.trip === null) return null;
      return {
        systemIds: assembled.trip.rows.map((row) => row.systemId),
        securities: assembled.trip.rows.map((row) => row.security),
        summary: assembled.trip.summary,
      };
    },
    [
      fromId,
      resolved,
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
      activity,
      lawless,
      jump,
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
      lawless,
      jump,
    });
    return assembled.kind === 'route'
      ? { ...assembled, requestKey, planWithAvoid, planWithPreference }
      : assembled;
  }, [
    bridges,
    fromId,
    stops,
    resolved,
    requestKey,
    activity,
    lawless,
    holes,
    planWithAvoid,
    planWithPreference,
    pins,
    listed,
    jump,
  ]);
}
