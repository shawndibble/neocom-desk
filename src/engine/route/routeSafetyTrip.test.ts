import { describe, expect, it } from 'vitest';
import type { FindJumpRouteOptions, JumpGraph } from './jumpRoute';
import type { AnsiblexGate } from './ansiblex';
import type { PinnableHole } from './legWays';
import { HUB_SYSTEM_IDS, type TheraConnection } from './theraConnections';
import { planTrip, type TripPlan } from './tripPlan';
import { waypointSequence } from './waypoints';
import type { RouteSafetySystemEntry } from './routeSafety';
import {
  assembleRouteSafety,
  planLegAlternatives,
  routeSafetyNetwork,
  type LegAlternatives,
  type RouteSafetyActivity,
  type RouteSafetyAssembly,
  type RouteSafetyTripRow,
  type RouteSafetyTripInput,
} from './routeSafetyTrip';

/**
 * The graph `legWays.test.ts` draws:
 *
 *   START ─ W1 ─ W2 ─ W3 ─ W4 ─ END          the gate way, five jumps
 *   START ─ ENTRY ⤳ THERA ⤳ EXIT ─ END       four jumps through Thera
 *   START ─ F1 ─ F2 ─ FAR ⤳ THERA            a third, far-off Thera hole
 *   W2 ─ TURNUR ⤳ TEXIT ─ END                Turnur is gated lowsec
 *
 * ISLAND has no gates and no hole: nothing reaches it.
 */
const START = 30000001;
const W1 = 30000002;
const W2 = 30000003;
const W3 = 30000004;
const W4 = 30000005;
const END = 30000006;
const ENTRY = 30000007;
const EXIT = 30000008;
const F1 = 30000009;
const F2 = 30000010;
const FAR = 30000011;
const TEXIT = 30000012;
const ISLAND = 30000013;
const THERA = HUB_SYSTEM_IDS.thera;
const TURNUR = HUB_SYSTEM_IDS.turnur;

const GRAPH: JumpGraph = new Map([
  [START, [W1, ENTRY, F1]],
  [W1, [START, W2]],
  [W2, [W1, W3, TURNUR]],
  [W3, [W2, W4]],
  [W4, [W3, END]],
  [END, [W4, EXIT, TEXIT]],
  [ENTRY, [START]],
  [EXIT, [END]],
  [F1, [START, F2]],
  [F2, [F1, FAR]],
  [FAR, [F2]],
  [TURNUR, [W2]],
  [TEXIT, [END]],
  [THERA, []],
  [ISLAND, []],
]);

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

function hole(overrides: Partial<TheraConnection> & Pick<TheraConnection, 'id'>): TheraConnection {
  return {
    hub: 'thera',
    hubSignature: 'ABC-123',
    exitSignature: 'XYZ-789',
    exitSystemId: ENTRY,
    exitSystemName: null,
    exitClass: null,
    exitRegionName: null,
    wormholeType: null,
    maxShipSize: 'large',
    expiresAt: NOW + 10 * HOUR,
    ...overrides,
  };
}

const VIA_ENTRY = hole({ id: '1', exitSystemId: ENTRY });
const VIA_EXIT = hole({ id: '2', exitSystemId: EXIT });
const VIA_FAR = hole({ id: '3', exitSystemId: FAR });
const VIA_TURNUR = hole({ id: '4', hub: 'turnur', exitSystemId: TEXIT });
/** An exit Turnur's own gate already joins: the gate is the jump. */
const VIA_W2 = hole({ id: '5', hub: 'turnur', exitSystemId: W2 });
const THERA_HOLES = [VIA_ENTRY, VIA_EXIT];

const BY_GATE = [START, W1, W2, W3, W4, END];
const THROUGH_THERA = [START, ENTRY, THERA, EXIT, END];
const THROUGH_TURNUR = [START, W1, W2, TURNUR, TEXIT, END];
const THROUGH_FAR = [START, F1, F2, FAR, THERA, EXIT, END];

const BRIDGE: AnsiblexGate = { fromId: W1, toId: W4, name: 'W1 » W4 - Shortcut' };

/** Only what a pin names of a hole: the key carries no more. */
const ends = ({ id, exitSystemId, hub }: TheraConnection): PinnableHole => ({
  id,
  exitSystemId,
  hub,
});

const SYSTEMS: ReadonlyMap<number, RouteSafetySystemEntry> = new Map(
  [...GRAPH.keys()].map((id) => [id, { id, name: `S${id}`, security: 0.9, regionId: 1 }])
);
const REGION_NAMES: ReadonlyMap<number, string> = new Map([[1, 'The Forge']]);
const ACTIVITY: RouteSafetyActivity = {
  kills: new Map([[W1, { shipKills: 2, podKills: 1, npcKills: 0 }]]),
  jumps: new Map([[W1, 30]]),
  fetchedAt: new Date(NOW),
};

interface Scenario {
  stops?: number[];
  returnToStart?: boolean;
  /** The qualifying holes, which the trip is planned with. */
  holes?: TheraConnection[];
  /** Every open hole; `null` while there is no list. */
  listed?: TheraConnection[] | null;
  bridges?: AnsiblexGate[] | null;
  pins?: string[];
  activity?: RouteSafetyActivity | null;
}

/** Plans the trip as the adapter does, with the network's nameless ends, then assembles it. */
function plan({
  stops = [END],
  returnToStart = false,
  holes = [],
  listed = holes,
  bridges = null,
  pins = [],
  activity = ACTIVITY,
}: Scenario = {}): {
  state: RouteSafetyAssembly;
  alternatives: LegAlternatives[];
  systemIds: number[];
  tripPlan: TripPlan;
} {
  const holeEnds = holes.map(({ exitSystemId, hub }) => ({ exitSystemId, hub }));
  const bridgeEnds = (bridges ?? []).map(({ fromId, toId }) => ({ fromId, toId, name: '' }));
  const options: FindJumpRouteOptions = {
    preference: 'shortest',
    ...routeSafetyNetwork(holeEnds, bridgeEnds),
  };
  const tripPlan = planTrip(GRAPH, START, stops, options, { returnToStart });
  const trip = { plan: tripPlan, graph: GRAPH, options };
  const { legs: alternatives, systemIds } = planLegAlternatives(
    trip,
    { holes: holeEnds, bridges: bridgeEnds },
    { tokens: pins, listed: listed === null ? null : listed.map(ends) }
  );
  const state = assembleRouteSafety(
    input({
      planned: trip,
      alternatives,
      singleStop: stops.length === 1,
      pins,
      holes,
      listed,
      bridges,
      activity,
    })
  );
  return { state, alternatives, systemIds, tripPlan };
}

function input(
  overrides: Partial<RouteSafetyTripInput> & Pick<RouteSafetyTripInput, 'planned' | 'alternatives'>
): RouteSafetyTripInput {
  return {
    singleStop: true,
    pins: [],
    holes: [],
    listed: [],
    bridges: null,
    systems: SYSTEMS,
    regionNames: REGION_NAMES,
    activity: ACTIVITY,
    ...overrides,
  };
}

function route(state: RouteSafetyAssembly) {
  if (state.kind !== 'route') throw new Error(`expected a route, got ${state.kind}`);
  return state;
}

const systemsOf = (rows: readonly { systemId: number }[] | null) =>
  rows?.map((row) => row.systemId) ?? null;

/** How the route entered `to` from `from`: the row's tag, or `undefined` for no such step. */
function entryOf(rows: readonly RouteSafetyTripRow[] | null, from: number, to: number) {
  const at = rows?.findIndex(
    (row, index) => index > 0 && rows[index - 1].systemId === from && row.systemId === to
  );
  return at === undefined || at < 0 ? undefined : rows?.[at].entry;
}

const GATE = { kind: 'gate' } as const;

describe('routeSafetyNetwork', () => {
  it('joins holes and bridges as connections; only the holes make a system free', () => {
    expect(routeSafetyNetwork([VIA_ENTRY], [BRIDGE, { ...BRIDGE, name: 'twin' }])).toEqual({
      extraConnections: [
        [ENTRY, THERA],
        [W1, W4],
      ],
      freeSystems: new Set([THERA]),
    });
  });
});

describe('planLegAlternatives', () => {
  it('lists each leg’s ways, with nothing pinned', () => {
    const { alternatives } = plan({ holes: [...THERA_HOLES, VIA_TURNUR] });
    expect(alternatives).toHaveLength(1);
    expect(alternatives[0].pinned).toBeNull();
    expect(alternatives[0].ways.map((way) => [way.way, way.route])).toEqual([
      ['gates', { kind: 'route', systems: BY_GATE }],
      ['thera', { kind: 'route', systems: THROUGH_THERA }],
      ['turnur', { kind: 'route', systems: THROUGH_TURNUR }],
    ]);
  });

  it('names every system the trip, its ways and its pins cross', () => {
    const { systemIds } = plan({
      holes: THERA_HOLES,
      listed: [...THERA_HOLES, VIA_FAR],
      pins: ['3'],
    });
    expect(new Set(systemIds)).toEqual(new Set([...BY_GATE, ...THROUGH_THERA, ...THROUGH_FAR]));
  });

  it('waits on the hole list for a hub or hole pin, never for gates', () => {
    const waiting = plan({
      stops: [END, START],
      holes: THERA_HOLES,
      listed: null,
      pins: ['thera', 'gates'],
    });
    expect(waiting.alternatives.map(({ pinned }) => pinned)).toEqual([
      null,
      { kind: 'route', systems: [...BY_GATE].reverse(), hole: null },
    ]);
  });

  it('flies a pinned hole the list still holds, even one the filters skip', () => {
    const { alternatives } = plan({
      holes: THERA_HOLES,
      listed: [...THERA_HOLES, VIA_FAR],
      pins: ['3'],
    });
    expect(alternatives[0].pinned).toEqual({
      kind: 'route',
      systems: THROUGH_FAR,
      hole: ends(VIA_FAR),
    });
  });

  it('calls a pinned hole the list no longer holds closed', () => {
    const { alternatives } = plan({ holes: THERA_HOLES, pins: ['3'] });
    expect(alternatives[0].pinned).toEqual({ kind: 'closed' });
  });
});

describe('assembleRouteSafety', () => {
  it('flies the planner’s pick, listing it first among the ways', () => {
    const state = route(plan({ holes: [...THERA_HOLES, VIA_TURNUR] }).state);
    const [leg] = state.legs;
    expect(systemsOf(leg.rows)).toEqual(THROUGH_THERA);
    expect(leg.summary?.jumps).toBe(4);
    expect(leg.pin).toBe('');
    expect(leg.pinNote).toBeNull();
    expect(leg.ways.map((way) => [way.kind, way.pin, way.inUse])).toEqual([
      ['thera', 'thera', true],
      ['gates', 'gates', false],
      ['turnur', 'turnur', false],
    ]);
    expect(leg.ways[0].holes).toEqual([
      { from: ENTRY, to: THERA, hole: VIA_ENTRY },
      { from: THERA, to: EXIT, hole: VIA_EXIT },
    ]);
    expect(leg.ways[1].holes).toEqual([]);
  });

  it('lists the planner’s pick as its own way when no other way flies it', () => {
    const { tripPlan } = plan({ holes: THERA_HOLES });
    const trip = { plan: tripPlan, graph: GRAPH };
    const alternatives: LegAlternatives[] = [
      { ways: [{ way: 'gates', route: { kind: 'route', systems: BY_GATE } }], pinned: null },
    ];
    const state = route(
      assembleRouteSafety(input({ planned: trip, alternatives, holes: THERA_HOLES }))
    );
    expect(state.legs[0].ways.map((way) => [way.kind, way.pin, way.inUse])).toEqual([
      ['planner', null, true],
      ['gates', 'gates', false],
    ]);
  });

  it('flies a pinned way in place of the planner’s pick', () => {
    const state = route(plan({ holes: THERA_HOLES, pins: ['gates'] }).state);
    const [leg] = state.legs;
    expect(systemsOf(leg.rows)).toEqual(BY_GATE);
    expect(leg.pin).toBe('gates');
    expect(leg.ways.map((way) => [way.kind, way.inUse])).toEqual([
      ['gates', true],
      ['thera', false],
    ]);
  });

  it('keeps the hub’s way beside a pinned hole that flies the same route', () => {
    const state = route(plan({ holes: THERA_HOLES, pins: ['1'] }).state);
    expect(state.legs[0].ways.map((way) => [way.kind, way.pin, way.inUse])).toEqual([
      ['hole', '1', true],
      ['gates', 'gates', false],
      ['thera', 'thera', false],
    ]);
  });

  it('counts a pinned hole the filters skip as a hole jump', () => {
    const state = route(
      plan({ holes: THERA_HOLES, listed: [...THERA_HOLES, VIA_FAR], pins: ['3'] }).state
    );
    const [leg] = state.legs;
    expect(systemsOf(leg.rows)).toEqual(THROUGH_FAR);
    expect(leg.ways[0]).toMatchObject({ kind: 'hole', pin: '3', inUse: true });
    expect(leg.ways[0].holes.map(({ hole }) => hole)).toEqual([VIA_FAR, VIA_EXIT]);
    expect(entryOf(leg.rows, FAR, THERA)).toEqual({ kind: 'hole', hole: VIA_FAR });
    expect(state.trip?.holeJumps).toBe(2);
  });

  it('reads a pinned hole the filters allow as the qualifying one, matched by id', () => {
    const relisted = { ...VIA_ENTRY, expiresAt: NOW + 20 * HOUR };
    const state = route(
      plan({ holes: THERA_HOLES, listed: [relisted, VIA_EXIT], pins: ['1'] }).state
    );
    expect(entryOf(state.legs[0].rows, ENTRY, THERA)).toEqual({ kind: 'hole', hole: VIA_ENTRY });
  });

  it.each([
    ['no-list', { holes: THERA_HOLES, listed: null, pins: ['thera'] }],
    ['closed', { holes: THERA_HOLES, pins: ['3'] }],
    ['no-hole', { holes: THERA_HOLES, pins: ['turnur'] }],
    ['no-bridge', { holes: THERA_HOLES, pins: ['ansiblex'] }],
  ] as const)(
    'says %s when the pin cannot be flown, and flies the planner’s pick',
    (note, scenario) => {
      const [leg] = route(plan({ ...scenario, pins: [...scenario.pins] }).state).legs;
      expect(leg.pinNote).toBe(note);
      expect(systemsOf(leg.rows)).toEqual(THROUGH_THERA);
    }
  );

  it('shows a gate where a gate and a hole join the same two systems', () => {
    const state = route(plan({ holes: [VIA_W2, VIA_TURNUR], pins: ['turnur'] }).state);
    expect(systemsOf(state.legs[0].rows)).toEqual(THROUGH_TURNUR);
    expect(entryOf(state.legs[0].rows, W2, TURNUR)).toEqual(GATE);
    expect(entryOf(state.legs[0].rows, TURNUR, TEXIT)).toEqual({ kind: 'hole', hole: VIA_TURNUR });
    expect(state.trip?.holeJumps).toBe(1);
  });

  it('names the Ansiblex each bridge jump crosses, never the stargate graph', () => {
    const state = route(plan({ holes: THERA_HOLES, bridges: [BRIDGE] }).state);
    const [leg] = state.legs;
    expect(systemsOf(leg.rows)).toEqual([START, W1, W4, END]);
    expect(leg.ways[0]).toMatchObject({ kind: 'ansiblex', inUse: true });
    expect(leg.ways[0].bridges).toEqual([{ from: W1, to: W4, gate: BRIDGE }]);
    expect(entryOf(leg.rows, W1, W4)).toEqual({ kind: 'bridge', gate: BRIDGE });
    expect(state.trip).toMatchObject({ holeJumps: 0, bridgeJumps: 1 });
  });

  it('tags each row with how it was entered, the start with nothing', () => {
    const state = route(plan({ holes: THERA_HOLES }).state);
    expect(state.legs[0].rows?.map((row) => row.entry)).toEqual([
      null,
      GATE,
      { kind: 'hole', hole: VIA_ENTRY },
      { kind: 'hole', hole: VIA_EXIT },
      GATE,
    ]);
  });

  it('reads a bridge flown back the other way as that bridge', () => {
    const state = route(plan({ bridges: [BRIDGE], returnToStart: true }).state);
    expect(systemsOf(state.legs[1].rows)).toEqual([END, W4, W1, START]);
    expect(entryOf(state.legs[1].rows, W4, W1)).toEqual({ kind: 'bridge', gate: BRIDGE });
    expect(state.trip?.bridgeJumps).toBe(2);
  });

  it('prefers the Ansiblex standing in the system the step leaves', () => {
    const back: AnsiblexGate = { fromId: W4, toId: W1, name: 'W4 » W1 - Back' };
    const state = route(plan({ bridges: [back, BRIDGE] }).state);
    expect(entryOf(state.legs[0].rows, W1, W4)).toEqual({ kind: 'bridge', gate: BRIDGE });
  });

  it('shows a gate where a gate and a bridge join the same two systems', () => {
    const twin: AnsiblexGate = { fromId: W1, toId: W2, name: 'W1 » W2 - Twin' };
    const state = route(plan({ bridges: [twin], pins: ['gates'] }).state);
    expect(entryOf(state.legs[0].rows, W1, W2)).toEqual(GATE);
    expect(state.legs[0].ways[0].bridges).toEqual([]);
    expect(state.trip).toMatchObject({ holeJumps: 0, bridgeJumps: 0 });
  });

  it('keeps the gate rows of each later leg, never its repeated start', () => {
    const state = route(plan({ holes: THERA_HOLES, returnToStart: true }).state);
    const entries = state.trip?.rows.map((row) => row.entry) ?? [];
    expect(entries[0]).toBeNull();
    expect(entries.slice(1).every((entry) => entry !== null)).toBe(true);
  });

  it('cuts the waypoints at a hole’s entrance, off the row tags', () => {
    const state = route(plan({ holes: THERA_HOLES }).state);
    expect(waypointSequence(state.legs)).toEqual({
      waypoints: [ENTRY],
      cutOff: { entrance: ENTRY, exit: THERA, kind: 'hole' },
    });
  });

  it('cuts the waypoints at a bridge’s entrance, as a bridge', () => {
    const state = route(plan({ bridges: [BRIDGE] }).state);
    expect(waypointSequence(state.legs).cutOff).toEqual({ entrance: W1, exit: W4, kind: 'bridge' });
  });

  it('reads a step nothing known joins as a gate', () => {
    // Planned through Thera, then read against no holes at all.
    const { tripPlan, alternatives } = plan({ holes: THERA_HOLES });
    const state = route(
      assembleRouteSafety(input({ planned: { plan: tripPlan, graph: GRAPH }, alternatives }))
    );
    expect(state.legs[0].rows?.slice(1).map((row) => row.entry)).toEqual([GATE, GATE, GATE, GATE]);
    expect(state.trip).toMatchObject({ holeJumps: 0, bridgeJumps: 0 });
  });

  it('sums the whole trip across its legs', () => {
    const state = route(plan({ holes: THERA_HOLES, returnToStart: true }).state);
    expect(state.legs).toHaveLength(2);
    expect(state.trip?.stopIndexes).toEqual([4, 8]);
    expect(systemsOf(state.trip?.rows ?? null)).toEqual([
      ...THROUGH_THERA,
      ...[...THROUGH_THERA].reverse().slice(1),
    ]);
    expect(state.trip?.summary.jumps).toBe(8);
    expect(state.trip?.holeJumps).toBe(4);
    expect(state.reordered).toBeNull();
  });

  it('is no-route when the one stop has no route', () => {
    expect(plan({ stops: [ISLAND] }).state).toEqual({ kind: 'no-route' });
    expect(plan({ stops: [ISLAND], returnToStart: true }).state).toEqual({ kind: 'no-route' });
  });

  it('flies the one stop by a pinned route the planner has none for', () => {
    const tripPlan: TripPlan = {
      legs: [{ from: START, to: END, route: { kind: 'no-route' } }],
      reordered: null,
      unreachable: true,
    };
    const alternatives: LegAlternatives[] = [
      { ways: [], pinned: { kind: 'route', systems: BY_GATE, hole: null } },
    ];
    const state = route(
      assembleRouteSafety(input({ planned: { plan: tripPlan, graph: GRAPH }, alternatives }))
    );
    expect(systemsOf(state.legs[0].rows)).toEqual(BY_GATE);
  });

  it('keeps the other legs when one stop has no route, with no whole trip to sum', () => {
    const state = route(plan({ stops: [END, ISLAND] }).state);
    expect(state.unreachable).toBe(true);
    expect(state.trip).toBeNull();
    expect(systemsOf(state.legs[0].rows)).toEqual(BY_GATE);
    expect(state.legs[1]).toMatchObject({ rows: null, summary: null });
    expect(state.legs[1].ways).toEqual([
      { kind: 'gates', pin: 'gates', summary: null, holes: [], bridges: [], inUse: false },
    ]);
  });

  it('joins the hour of activity to each system', () => {
    const state = route(plan().state);
    expect(state.legs[0].rows?.[1]).toMatchObject({ systemId: W1, shipKills: 2, jumps: 30 });
    expect(state).toMatchObject({
      fetchedAt: new Date(NOW),
      activityLoading: false,
      activityUnavailable: false,
    });
  });

  it('says the activity is loading, and never reads it as zero', () => {
    const state = route(plan({ activity: null }).state);
    expect(state.legs[0].rows?.[1]).toMatchObject({ shipKills: null, jumps: null });
    expect(state).toMatchObject({
      fetchedAt: null,
      activityLoading: true,
      activityUnavailable: false,
    });
  });

  it('says a feed is unavailable when it could not be read', () => {
    const state = route(plan({ activity: { ...ACTIVITY, kills: null } }).state);
    expect(state.activityUnavailable).toBe(true);
    expect(state.legs[0].summary?.shipKills).toBeNull();
  });
});
