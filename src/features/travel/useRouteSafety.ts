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
 *
 * Ways to fly each leg (issue #2477): beside the planner's pick, each leg
 * carries its other ways — gates only, and through each hub with a
 * qualifying hole (`engine/route/legWays.ts`) — and a leg the pilot pinned
 * (`pins`) is flown that way instead. A pin that cannot be flown (its hole
 * closed, its hub has no hole, Hole jumps are off) says why on the leg and
 * the planner's pick flies it.
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
import {
  legWays,
  parseLegPin,
  pinnedLegRoute,
  type LegPin,
  type LegWay,
  type PinnableHole,
  type PinnedLegRoute,
} from '@/engine/route/legWays';
import {
  holeEndsFromKey,
  holeNetworkFromKey,
  holeNetworkKey,
  holeStepFinder,
  holeStepIndexes,
  type HoleAt,
  type HoleNetwork,
} from '@/engine/route/routeHoles';
import type { TheraConnection } from '@/engine/route/theraConnections';
import type { TripOptions, TripPlan } from '@/engine/route/tripPlan';
import { planLocalTrip, type LocalTripResult } from '@/features/route/localRoute';
import type { RouteQuery } from '@/features/route/routeRules';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { loadRouteRegionNames, loadSystemActivity, type SystemActivity } from './routeSafetyData';

/** A hole jump along one way to fly a leg. */
export interface RouteSafetyWayHole {
  from: number;
  to: number;
  hole: TheraConnection;
}

/**
 * One way to fly a leg, with its facts. `pin` is the token Use for this leg
 * writes — `null` for the planner's own pick, which un-pins the leg.
 */
export interface RouteSafetyWay {
  kind: 'planner' | 'gates' | 'thera' | 'turnur' | 'hole';
  pin: string | null;
  /** `null` when this way does not reach the leg's far end. */
  summary: RouteSafetySummary | null;
  holes: RouteSafetyWayHole[];
  inUse: boolean;
}

/** Why a leg's pin is not what it is flown by. */
export type LegPinNote = 'closed' | 'no-hole' | 'no-route' | 'no-list';

/** One Leg of the trip: its rows and facts, or `null` for both when no stargate route flies it. */
export interface RouteSafetyLeg {
  from: number;
  to: number;
  rows: RouteSafetyRow[] | null;
  summary: RouteSafetySummary | null;
  /** The ways to fly it, the one in use first; gates only is always among them. */
  ways: RouteSafetyWay[];
  /** The leg's pin token, `''` when it is flown as planned. */
  pin: string;
  /** Set when the leg is pinned but flown by the planner's pick instead, and why. */
  pinNote: LegPinNote | null;
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

export type { HoleAt };

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

/** A leg's other ways, and its pinned route when it has a pin to fly. */
interface LegAlternatives {
  ways: LegWay[];
  pinned: PinnedLegRoute<PinnableHole> | null;
}

/**
 * What one leg's pin asks for, as far as the hole list can answer: `waiting`
 * is a hole or hub pin while no list is to hand, `closed` a hole the list no
 * longer holds.
 */
type PinRequest = { pin: LegPin; hole: PinnableHole | null } | 'waiting' | 'closed' | null;

/**
 * Each leg's pin, named with what the hole list says about it — the hole's ends,
 * or that it closed — so the trip re-plans when a pinned hole closes, and
 * never merely as the list's remaining life ticks down.
 */
function pinsKeyFor(
  pins: readonly string[],
  listed: ReadonlyMap<string, TheraConnection> | null
): string {
  return pins
    .map((token) => {
      const pin = parseLegPin(token);
      if (pin === null) return '';
      if (pin.kind === 'gates') return token;
      if (listed === null) return `${token}@wait`;
      if (pin.kind === 'hub') return token;
      const hole = listed.get(pin.id);
      return hole ? `${token}@${hole.exitSystemId}:${hole.hub}` : `${token}@closed`;
    })
    .join(',');
}

function pinRequestsFromKey(key: string): PinRequest[] {
  if (key === '') return [];
  return key.split(',').map((part): PinRequest => {
    const [token, about] = part.split('@');
    const pin = parseLegPin(token);
    if (pin === null) return null;
    if (about === 'wait') return 'waiting';
    if (about === 'closed') return 'closed';
    if (pin.kind !== 'hole') return { pin, hole: null };
    const [hole] = holeEndsFromKey(about ?? '');
    return hole ? { pin, hole: { ...hole, id: pin.id } } : 'closed';
  });
}

function sameRoute(a: readonly number[] | null, b: readonly number[] | null): boolean {
  return a !== null && b !== null && a.length === b.length && a.every((id, i) => id === b[i]);
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

export function useRouteSafety(
  fromId: number | null,
  stops: readonly number[],
  tripOptions: TripOptions,
  route: RouteQuery,
  holes: readonly TheraConnection[] = NO_HOLES,
  /** Each leg's pin token (`routeSafetyLink.ts`), `''` for a leg flown as planned. */
  pins: readonly string[] = NO_PINS,
  /** Every open hole EVE-Scout lists, or `null` while there is no list (Hole jumps off, loading, unreachable). */
  listed: readonly TheraConnection[] | null = null
): RouteSafetyState {
  const [activity, setActivity] = useState<SystemActivity | null>(null);
  const [resolved, setResolved] = useState<ResolvedTrip | null>(null);
  const { rules, key: routeKey, hydrated } = route;
  const { optimize = false, returnToStart = false, keepLastStopLast = false } = tripOptions;
  const stopsKey = stops.join(',');
  const networkKey = holeNetworkKey(holes);
  const network = useMemo(() => holeNetworkFromKey(networkKey), [networkKey]);
  const listedById = useMemo(
    () => (listed === null ? null : new Map(listed.map((hole) => [hole.id, hole]))),
    [listed]
  );
  const pinsKey = pinsKeyFor(pins, listedById);
  const requestKey = `${fromId}:${stopsKey}:${optimize}:${returnToStart}:${keepLastStopLast}:${routeKey}:${networkKey}:${pinsKey}`;
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
      const addRegions = (route: readonly number[]) => {
        for (const id of route) {
          const regionId = byId.get(id)?.regionId;
          if (regionId !== undefined) regionIds.add(regionId);
        }
      };
      const alternatives: LegAlternatives[] = [];
      if (result.kind === 'trip') {
        const { graph, options } = result;
        const qualifying = holeEndsFromKey(networkKey);
        const requests = pinRequestsFromKey(pinsKey);
        result.plan.legs.forEach((leg, index) => {
          if (leg.route.kind === 'route') addRegions(leg.route.systems);
          const ways = legWays(graph, leg.from, leg.to, options, qualifying);
          const request = requests[index] ?? null;
          let pinned: PinnedLegRoute<PinnableHole> | null = null;
          if (request === 'closed') pinned = { kind: 'closed' };
          else if (request !== null && request !== 'waiting') {
            pinned = pinnedLegRoute(graph, leg.from, leg.to, request.pin, options, {
              qualifying: qualifying.map((ends) => ({ ...ends, id: '' })),
              listed: request.hole ? [request.hole] : [],
            });
          }
          for (const way of ways) if (way.route.kind === 'route') addRegions(way.route.systems);
          if (pinned?.kind === 'route') addRegions(pinned.systems);
          alternatives.push({ ways, pinned });
        });
      }
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
    networkKey,
    pinsKey,
    requestKey,
  ]);

  return useMemo((): RouteSafetyState => {
    if (fromId === null || stops.length === 0) return { kind: 'incomplete' };
    if (stops.length === 1 && stops[0] === fromId) return { kind: 'same-system' };
    if (resolved?.requestKey !== requestKey) return { kind: 'loading' };
    const { result } = resolved;
    if (result.kind === 'unknown') return result;
    const { plan, graph } = result;
    // A pinned hole the filters skip is still a hole jump on the leg it is flown on.
    const pinnedHoles = resolved.alternatives.flatMap(({ pinned }) => {
      const hole =
        pinned?.kind === 'route' && pinned.hole ? listedById?.get(pinned.hole.id) : undefined;
      return hole && !holes.some((qualifying) => qualifying.id === hole.id) ? [hole] : [];
    });
    const holeAt: HoleAt = holeStepFinder(graph, [...holes, ...pinnedHoles]);
    // One stop is the page as it always was: no route is the whole answer.
    const firstPinned = resolved.alternatives[0]?.pinned;
    if (
      stops.length === 1 &&
      plan.legs[0]?.route.kind !== 'route' &&
      firstPinned?.kind !== 'route'
    ) {
      return { kind: 'no-route' };
    }
    const inputs = {
      systems: resolved.systems,
      regionNames: resolved.regionNames,
      kills: activity?.kills ?? null,
      jumps: activity?.jumps ?? null,
    };
    const summaryOf = (systems: readonly number[]) =>
      summarizeRouteSafety(buildRouteSafetyRows(systems, inputs));
    const holesOn = (systems: readonly number[]): RouteSafetyWayHole[] =>
      holeStepIndexes(systems, holeAt).flatMap((index) => {
        const hole = holeAt(systems[index - 1], systems[index]);
        return hole ? [{ from: systems[index - 1], to: systems[index], hole }] : [];
      });
    const legs = plan.legs.map((leg, index): RouteSafetyLeg => {
      const { ways, pinned } = resolved.alternatives[index] ?? { ways: [], pinned: null };
      const planner = leg.route.kind === 'route' ? leg.route.systems : null;
      const flown = pinned?.kind === 'route' ? pinned.systems : planner;
      const token = pins[index] ?? '';
      const pin = parseLegPin(token);
      let pinNote: LegPinNote | null = null;
      if (pin !== null && pinned === null && pin.kind !== 'gates' && listed === null) {
        pinNote = 'no-list';
      } else if (pinned !== null && pinned.kind !== 'route') {
        pinNote = pinned.kind;
      }

      // The pinned hole, gates only, each hub: one entry per distinct route.
      const candidates: {
        kind: RouteSafetyWay['kind'];
        pin: string | null;
        systems: number[] | null;
      }[] = [];
      if (pinned?.kind === 'route' && pin?.kind === 'hole') {
        candidates.push({ kind: 'hole', pin: token, systems: pinned.systems });
      }
      for (const way of ways) {
        candidates.push({
          kind: way.way,
          pin: way.way,
          systems: way.route.kind === 'route' ? way.route.systems : null,
        });
      }
      // The pinned hole never hides a hub's own way: both stay listed.
      const distinct = candidates.filter(
        (candidate, at) =>
          candidate.systems === null ||
          !candidates
            .slice(0, at)
            .some(
              (earlier) => earlier.kind !== 'hole' && sameRoute(earlier.systems, candidate.systems)
            )
      );
      if (
        planner !== null &&
        !distinct.some((candidate) => sameRoute(candidate.systems, planner))
      ) {
        distinct.unshift({ kind: 'planner', pin: null, systems: planner });
      }
      let inUseTaken = false;
      const listedWays = distinct.map((candidate): RouteSafetyWay => {
        const inUse = !inUseTaken && sameRoute(candidate.systems, flown);
        if (inUse) inUseTaken = true;
        return {
          kind: candidate.kind,
          pin: candidate.pin,
          summary: candidate.systems ? summaryOf(candidate.systems) : null,
          holes: candidate.systems ? holesOn(candidate.systems) : [],
          inUse,
        };
      });
      const shownWays = [
        ...listedWays.filter((way) => way.inUse),
        ...listedWays.filter((way) => !way.inUse),
      ];

      if (flown === null) {
        return {
          from: leg.from,
          to: leg.to,
          rows: null,
          summary: null,
          ways: shownWays,
          pin: token,
          pinNote,
        };
      }
      const rows = buildRouteSafetyRows(flown, inputs);
      return {
        from: leg.from,
        to: leg.to,
        rows,
        summary: summarizeRouteSafety(rows),
        ways: shownWays,
        pin: token,
        pinNote,
      };
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
              holeJumps: holeStepIndexes(
                joined.rows.map((row) => row.systemId),
                holeAt
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
  }, [
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
    listedById,
  ]);
}
