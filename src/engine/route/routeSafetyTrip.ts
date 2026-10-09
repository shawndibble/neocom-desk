/**
 * Route Safety's trip, assembled (issue #2539): a planned trip, each leg's
 * other ways and pins, and the hour of activity, turned into what the page
 * draws — each leg's rows and Ways to fly, and the whole trip's facts.
 *
 * Pure, and in two steps because they change at different rates:
 * - `planLegAlternatives` searches the stargate graph for each leg's ways and
 *   its pinned route. It is the costly step, run once per planned trip.
 * - `assembleRouteSafety` reads those routes against the live hole, bridge
 *   and activity lists. It is cheap, and re-run as activity arrives.
 *
 * The rules a way's list follows live here: one entry per distinct route (a
 * pinned hole never hiding its hub's own way), the planner's pick added when
 * no way flies it, the way in use first, why a pin is not flown, and a pinned
 * hole the filters skip still read as a hole jump.
 *
 * Holes (issue #2476) and Ansiblex (issue #2478) are extra connections for
 * the search only: the stargate graph never holds them. Each row says how it
 * was entered — gate, hole or bridge (issue #2546) — decided here once, so
 * the strip, the table, the facts and the waypoints never re-derive it.
 * Where a gate and a hole or bridge join the same two systems the gate is
 * the jump shown: the pilot can always fly the gate.
 */
import { bridgeBetween, bridgeConnections, type AnsiblexGate } from './ansiblex';
import { lightYearDistance, type SystemPosition } from './jumpDrive';
import { jumpWayFacts, type JumpDriveOptions, type JumpHop, type JumpWayFacts } from './jumpLegs';
import type { FindJumpRouteOptions, JumpGraph } from './jumpRoute';
import {
  legWays,
  type JumpContext,
  parseLegPin,
  pinWaitsOnHoleList,
  pinnedLegRoute,
  type LegWay,
  type PinnableHole,
  type PinnedLegRoute,
} from './legWays';
import { holeBetween, holeNetwork, type HoleEnds, type HoleNetwork } from './routeHoles';
import {
  buildRouteSafetyRows,
  joinLegs,
  summarizeRouteSafety,
  summarizeTrip,
  type RouteSafetyInputs,
  type RouteSafetyRow,
  type RouteSafetySummary,
  type RouteSafetySystemEntry,
  type SystemKills,
} from './routeSafety';
import type { TheraConnection } from './theraConnections';
import type { TripPlan } from './tripPlan';

/** How a route entered a system from the one before it. */
export type RouteStep =
  | { kind: 'gate' }
  | { kind: 'hole'; hole: TheraConnection }
  | { kind: 'bridge'; gate: AnsiblexGate }
  | { kind: 'jump'; distanceLy: number };

/** A Route Safety row, tagged with how its system was entered. */
export interface RouteSafetyTripRow extends RouteSafetyRow {
  /** `null` for the system a leg or the trip starts in. */
  entry: RouteStep | null;
}

/** A hole jump along one way to fly a leg. */
export interface RouteSafetyWayHole {
  from: number;
  to: number;
  hole: TheraConnection;
}

/** A bridge jump along one way to fly a leg. */
export interface RouteSafetyWayBridge {
  from: number;
  to: number;
  gate: AnsiblexGate;
}

/**
 * One way to fly a leg, with its facts. `pin` is the token clicking the way's
 * box writes — `null` for the planner's own pick, which un-pins the leg.
 */
export interface RouteSafetyWay {
  kind: 'planner' | 'gates' | 'thera' | 'turnur' | 'hole' | 'ansiblex' | 'jump';
  pin: string | null;
  /** `null` when this way does not reach the leg's far end. */
  summary: RouteSafetySummary | null;
  holes: RouteSafetyWayHole[];
  bridges: RouteSafetyWayBridge[];
  /** Fuel, light years and fatigue of the jump drive legs; `null` when the way has none. */
  jump: JumpWayFacts | null;
  inUse: boolean;
}

/** Why a leg's pin is not what it is flown by. */
export type LegPinNote = 'closed' | 'no-hole' | 'no-route' | 'no-list' | 'no-bridge';

/** One Leg of the trip: its rows and facts, or `null` for both when no stargate route flies it. */
export interface RouteSafetyLeg {
  from: number;
  to: number;
  rows: RouteSafetyTripRow[] | null;
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
  rows: RouteSafetyTripRow[];
  /** Where along `rows` each leg ends. */
  stopIndexes: number[];
  summary: RouteSafetySummary;
  /** How many of the trip's jumps go through a wormhole. */
  holeJumps: number;
  /** How many go over an Ansiblex; the rest are by gate. */
  bridgeJumps: number;
  /** How many go by jump drive. */
  driveJumps: number;
  /** The trip's jump drive legs, or `null` when it has none. */
  jump: JumpWayFacts | null;
}

/** A trip as the planner left it: the stargate graph it was planned on, and the search, holes and all. */
export interface PlannedTrip {
  plan: TripPlan;
  graph: JumpGraph;
  options: FindJumpRouteOptions;
}

/** A leg's other ways, and its pinned route when it has a pin to fly. */
export interface LegAlternatives {
  ways: LegWay[];
  /** `null` with no pin, and while a hole or hub pin waits on the hole list. */
  pinned: PinnedLegRoute<PinnableHole> | null;
}

/**
 * The search's view of the qualifying holes and the known bridges. The
 * bridges join the holes' connections; only holes make a system free.
 */
export function routeSafetyNetwork(
  holes: readonly HoleEnds[],
  bridges: readonly AnsiblexGate[]
): HoleNetwork {
  const holeNet = holeNetwork(holes);
  return {
    extraConnections: [...holeNet.extraConnections, ...bridgeConnections(bridges)],
    freeSystems: holeNet.freeSystems,
  };
}

/**
 * Each leg's Ways to fly and pinned route, and every system any of them (or
 * the planner's pick) crosses — what the region names are looked up for.
 *
 * `network` is what the trip was planned with: the qualifying holes and the
 * known bridges, their ends are enough. `pins.listed` holds the open holes
 * a hole pin may name — EVE-Scout's list, or just the pinned holes it still
 * holds — or is `null` while there is no list: a hole or hub pin then waits,
 * unflown.
 */
export function planLegAlternatives(
  trip: PlannedTrip,
  network: { holes: readonly HoleEnds[]; bridges: readonly AnsiblexGate[] },
  pins: { tokens: readonly string[]; listed: readonly PinnableHole[] | null },
  jump: JumpContext | null = null
): { legs: LegAlternatives[]; systemIds: number[] } {
  const { plan, graph, options } = trip;
  const crossed = new Set<number>();
  const cross = (systems: readonly number[]) => systems.forEach((id) => crossed.add(id));
  const qualifying = network.holes.map((ends) => ({ ...ends, id: '' }));
  const legs = plan.legs.map((leg, index): LegAlternatives => {
    if (leg.route.kind === 'route') cross(leg.route.systems);
    const ways = legWays(graph, leg.from, leg.to, options, network.holes, network.bridges, jump);
    for (const way of ways) if (way.route.kind === 'route') cross(way.route.systems);
    const pin = parseLegPin(pins.tokens[index] ?? '');
    const waiting = pins.listed === null && pin !== null && pinWaitsOnHoleList(pin);
    const pinned =
      pin === null || waiting
        ? null
        : pinnedLegRoute(graph, leg.from, leg.to, pin, options, {
            qualifying,
            listed: pins.listed ?? [],
            bridges: network.bridges,
            jump,
          });
    if (pinned?.kind === 'route') cross(pinned.systems);
    return { ways, pinned };
  });
  return { legs, systemIds: [...crossed] };
}

/** The hour of ESI activity. Each feed is `null` when it could not be read. */
export interface RouteSafetyActivity {
  kills: ReadonlyMap<number, SystemKills> | null;
  jumps: ReadonlyMap<number, number> | null;
  /** The older of the two feeds' ages, or `null` when neither arrived. */
  fetchedAt: Date | null;
}

/** What `assembleRouteSafety` reads: the planned trip, and the live lists and data around it. */
export interface RouteSafetyTripInput {
  planned: Pick<PlannedTrip, 'plan' | 'graph'>;
  /** From `planLegAlternatives`, one per leg. */
  alternatives: readonly LegAlternatives[];
  /** One Stop was asked for: no route is then the whole answer. */
  singleStop: boolean;
  /** Each leg's pin token, `''` for a leg flown as planned. */
  pins: readonly string[];
  /** The holes the filters allow. */
  holes: readonly TheraConnection[];
  /** Every open hole EVE-Scout lists, or `null` while there is no list. */
  listed: readonly TheraConnection[] | null;
  /** The known Ansiblex, or `null` while Use jump bridges is off. */
  bridges: readonly AnsiblexGate[] | null;
  systems: ReadonlyMap<number, RouteSafetySystemEntry>;
  regionNames: ReadonlyMap<number, string>;
  /** `null` while the feeds load. */
  activity: RouteSafetyActivity | null;
  /** Systems under a lawless insurgency now; leave out while there is no fresh list. */
  lawless?: ReadonlySet<number>;
  /** The hull's drive and every system's position, when jump legs are on. */
  jump?: {
    positions: ReadonlyMap<number, SystemPosition>;
    drive: Pick<JumpDriveOptions, 'fuelPerLy' | 'distanceFactor'>;
  } | null;
}

export type RouteSafetyAssembly =
  | { kind: 'no-route' }
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
    };

const GATE_STEP: RouteStep = { kind: 'gate' };

/** How many of a route's rows were entered through a hole, and how many over a bridge. */
export function stepJumps(rows: readonly Pick<RouteSafetyTripRow, 'entry'>[]): {
  holeJumps: number;
  bridgeJumps: number;
  driveJumps: number;
} {
  let holeJumps = 0;
  let bridgeJumps = 0;
  let driveJumps = 0;
  for (const { entry } of rows) {
    if (entry?.kind === 'hole') holeJumps += 1;
    else if (entry?.kind === 'bridge') bridgeJumps += 1;
    else if (entry?.kind === 'jump') driveJumps += 1;
  }
  return { holeJumps, bridgeJumps, driveJumps };
}

/** The jump hops and gate hops a run of tagged rows holds, in order. */
function hopsOf(rows: readonly Pick<RouteSafetyTripRow, 'entry' | 'systemId'>[]): JumpHop[] {
  return rows.flatMap((row, at): JumpHop[] => {
    if (at === 0 || !row.entry) return [];
    const from = rows[at - 1].systemId;
    return [
      row.entry.kind === 'jump'
        ? { kind: 'jump', from, to: row.systemId, distanceLy: row.entry.distanceLy }
        : { kind: 'gate', from, to: row.systemId },
    ];
  });
}

/**
 * How each step of a route was flown. A step a stargate joins is a gate jump,
 * whatever else joins it. A step nothing known joins reads as a gate too:
 * the adapter reads a trip only against the holes and bridges it was planned
 * with, so no route holds one.
 */
function stepReader(
  graph: JumpGraph,
  holes: readonly TheraConnection[],
  bridges: readonly AnsiblexGate[],
  positions: ReadonlyMap<number, SystemPosition> | null
): (systems: readonly number[]) => (RouteStep | null)[] {
  const stepOf = (from: number, to: number): RouteStep => {
    if (graph.get(from)?.includes(to)) return GATE_STEP;
    const hole = holeBetween(holes, from, to);
    if (hole) return { kind: 'hole', hole };
    const gate = bridgeBetween(bridges, from, to);
    if (gate) return { kind: 'bridge', gate };
    const a = positions?.get(from);
    const b = positions?.get(to);
    return a && b ? { kind: 'jump', distanceLy: lightYearDistance(a, b) } : GATE_STEP;
  };
  return (systems) =>
    systems.map((to, index) => (index === 0 ? null : stepOf(systems[index - 1], to)));
}

function sameRoute(a: readonly number[] | null, b: readonly number[] | null): boolean {
  return a !== null && b !== null && a.length === b.length && a.every((id, i) => id === b[i]);
}

/** The Route Safety trip: each leg's rows and ways, and the whole trip's facts. */
export function assembleRouteSafety(input: RouteSafetyTripInput): RouteSafetyAssembly {
  const { planned, alternatives, pins, holes, listed, bridges, activity } = input;
  const { plan, graph } = planned;
  // A pinned hole the filters skip is still a hole jump on the leg it is flown on.
  const listedById = new Map(listed?.map((hole) => [hole.id, hole]));
  const qualifyingIds = new Set(holes.map((hole) => hole.id));
  const pinnedHoles = alternatives.flatMap(({ pinned }) => {
    const hole =
      pinned?.kind === 'route' && pinned.hole ? listedById.get(pinned.hole.id) : undefined;
    return hole && !qualifyingIds.has(hole.id) ? [hole] : [];
  });
  const stepsOn = stepReader(
    graph,
    [...holes, ...pinnedHoles],
    bridges ?? [],
    input.jump?.positions ?? null
  );
  // One stop is the page as it always was: no route is the whole answer.
  if (
    input.singleStop &&
    plan.legs[0]?.route.kind !== 'route' &&
    alternatives[0]?.pinned?.kind !== 'route'
  ) {
    return { kind: 'no-route' };
  }
  const inputs: RouteSafetyInputs = {
    systems: input.systems,
    regionNames: input.regionNames,
    kills: activity?.kills ?? null,
    jumps: activity?.jumps ?? null,
    lawless: input.lawless,
  };
  const tagRows = (systems: readonly number[]): RouteSafetyTripRow[] => {
    const steps = stepsOn(systems);
    return buildRouteSafetyRows(systems, inputs).map((row, at) => ({
      ...row,
      entry: steps[at] ?? null,
    }));
  };
  const summaryOf = (systems: readonly number[]) =>
    summarizeRouteSafety(buildRouteSafetyRows(systems, inputs));
  /** A way's hole and bridge jumps, each step read once. */
  const jumpsOn = (systems: readonly number[]) => {
    const holeJumps: RouteSafetyWayHole[] = [];
    const bridgeJumps: RouteSafetyWayBridge[] = [];
    stepsOn(systems).forEach((step, at) => {
      const ends = { from: systems[at - 1], to: systems[at] };
      if (step?.kind === 'hole') holeJumps.push({ ...ends, hole: step.hole });
      else if (step?.kind === 'bridge') bridgeJumps.push({ ...ends, gate: step.gate });
    });
    return { holes: holeJumps, bridges: bridgeJumps };
  };
  const jumpOn = (rows: readonly Pick<RouteSafetyTripRow, 'entry' | 'systemId'>[]) => {
    const hops = hopsOf(rows);
    return input.jump && hops.some((hop) => hop.kind === 'jump')
      ? jumpWayFacts(hops, input.jump.drive)
      : null;
  };

  const legs = plan.legs.map((leg, index): RouteSafetyLeg => {
    const { ways, pinned } = alternatives[index] ?? { ways: [], pinned: null };
    const planner = leg.route.kind === 'route' ? leg.route.systems : null;
    const flown = pinned?.kind === 'route' ? pinned.systems : planner;
    const token = pins[index] ?? '';
    const pin = parseLegPin(token);
    let pinNote: LegPinNote | null = null;
    if (pin !== null && pinned === null && pinWaitsOnHoleList(pin) && listed === null) {
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
    if (planner !== null && !distinct.some((candidate) => sameRoute(candidate.systems, planner))) {
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
        ...(candidate.systems ? jumpsOn(candidate.systems) : { holes: [], bridges: [] }),
        jump: candidate.systems ? jumpOn(tagRows(candidate.systems)) : null,
        inUse,
      };
    });
    const shownWays = [
      ...listedWays.filter((way) => way.inUse),
      ...listedWays.filter((way) => !way.inUse),
    ];

    const rows = flown === null ? null : tagRows(flown);
    return {
      from: leg.from,
      to: leg.to,
      rows,
      summary: rows === null ? null : summarizeRouteSafety(rows),
      ways: shownWays,
      pin: token,
      pinNote,
    };
  });

  const legRows = legs.flatMap((leg) => (leg.rows ? [leg.rows] : []));
  let tripFacts: RouteSafetyTrip | null = null;
  if (legRows.length === legs.length) {
    const joined = joinLegs(legRows);
    tripFacts = {
      rows: joined.rows,
      stopIndexes: joined.stopIndexes,
      summary: summarizeTrip(legRows),
      ...stepJumps(joined.rows),
      jump: jumpOn(joined.rows),
    };
  }
  return {
    kind: 'route',
    legs,
    trip: tripFacts,
    reordered: plan.reordered,
    unreachable: plan.unreachable,
    fetchedAt: activity?.fetchedAt ?? null,
    activityLoading: activity === null,
    activityUnavailable: activity !== null && (activity.kills === null || activity.jumps === null),
  };
}
