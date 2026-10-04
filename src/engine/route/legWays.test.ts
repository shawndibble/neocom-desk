import { describe, expect, it } from 'vitest';
import { findJumpRoute, routeCost, routeSweepFrom, type JumpGraph } from './jumpRoute';
import { holeNetwork } from './routeHoles';
import { HUB_SYSTEM_IDS, type TheraConnection } from './theraConnections';
import {
  gatesOnlyOptions,
  legPinToken,
  legWays,
  parseLegPin,
  pinnedLegRoute,
  routeOverBridges,
  routeThroughHoles,
} from './legWays';
import { bridgeConnections, bridgeStepFinder, type AnsiblexGate } from './ansiblex';
import { bridgeHopKind, stargateHopKind, waypointSequence } from './waypoints';

/**
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
const THERA_HOLES = [VIA_ENTRY, VIA_EXIT, VIA_FAR];
const ALL_HOLES = [...THERA_HOLES, VIA_TURNUR];

const NETWORK = { ...holeNetwork(ALL_HOLES) };
const BY_GATE = [START, W1, W2, W3, W4, END];
const THROUGH_THERA = [START, ENTRY, THERA, EXIT, END];

describe('routeCost', () => {
  it('is what the search minimised for the route it found', () => {
    const route = findJumpRoute(GRAPH, START, END, NETWORK);
    expect(route).toEqual({ kind: 'route', systems: THROUGH_THERA });
    expect(routeCost(GRAPH, THROUGH_THERA, NETWORK)).toBe(
      routeSweepFrom(GRAPH, START, NETWORK).costs.get(END)
    );
  });

  it('cannot cross a step nothing joins', () => {
    expect(routeCost(GRAPH, [START, END], NETWORK)).toBe(Number.POSITIVE_INFINITY);
  });

  it('is zero for a route that goes nowhere', () => {
    expect(routeCost(GRAPH, [START], NETWORK)).toBe(0);
  });
});

describe('gatesOnlyOptions', () => {
  it('drops the holes but keeps the preference and the Avoided Systems', () => {
    const options = { ...NETWORK, preference: 'prefer-highsec' as const, avoid: new Set([W3]) };
    expect(gatesOnlyOptions(options)).toEqual({
      preference: 'prefer-highsec',
      avoid: new Set([W3]),
    });
    expect(findJumpRoute(GRAPH, START, END, gatesOnlyOptions(NETWORK))).toEqual({
      kind: 'route',
      systems: BY_GATE,
    });
  });
});

describe('routeThroughHoles', () => {
  it('flies into the hub through a hole and on from there', () => {
    expect(routeThroughHoles(GRAPH, START, END, [VIA_ENTRY], NETWORK)).toEqual({
      kind: 'route',
      systems: THROUGH_THERA,
    });
  });

  it('flies out of the hub through a hole, reaching the hub some other way first', () => {
    expect(routeThroughHoles(GRAPH, START, END, [VIA_EXIT], NETWORK)).toEqual({
      kind: 'route',
      systems: THROUGH_THERA,
    });
  });

  it('takes the cheapest of a hub’s holes', () => {
    expect(routeThroughHoles(GRAPH, START, END, THERA_HOLES, NETWORK)).toEqual({
      kind: 'route',
      systems: THROUGH_THERA,
    });
  });

  it('crosses a hole the pinned leg is forced through even when it is longer', () => {
    expect(routeThroughHoles(GRAPH, START, END, [VIA_FAR], NETWORK)).toEqual({
      kind: 'route',
      systems: [START, F1, F2, FAR, THERA, EXIT, END],
    });
  });

  it('never flies back out through the hole it came in by', () => {
    const twoHoles = holeNetwork([VIA_ENTRY, VIA_EXIT]);
    expect(routeThroughHoles(GRAPH, START, W1, [VIA_ENTRY], twoHoles)).toEqual({
      kind: 'route',
      systems: [START, ENTRY, THERA, EXIT, END, W4, W3, W2, W1],
    });
  });

  it('adds a forced hole the network does not hold', () => {
    const onlyExit = holeNetwork([VIA_EXIT]);
    expect(routeThroughHoles(GRAPH, START, END, [VIA_ENTRY], onlyExit)).toEqual({
      kind: 'route',
      systems: THROUGH_THERA,
    });
  });

  it('goes through a gated hub when a hole joins it', () => {
    expect(routeThroughHoles(GRAPH, START, END, [VIA_TURNUR], NETWORK)).toEqual({
      kind: 'route',
      systems: [START, W1, W2, TURNUR, TEXIT, END],
    });
  });

  it('still charges an Avoided System', () => {
    const avoidEntry = { ...NETWORK, avoid: new Set([ENTRY]) };
    expect(routeThroughHoles(GRAPH, START, END, THERA_HOLES, avoidEntry)).toEqual({
      kind: 'route',
      systems: [START, F1, F2, FAR, THERA, EXIT, END],
    });
  });

  it('is no-route when nothing reaches the far end', () => {
    expect(routeThroughHoles(GRAPH, START, ISLAND, THERA_HOLES, NETWORK)).toEqual({
      kind: 'no-route',
    });
  });

  it('is no-route with no holes to force', () => {
    expect(routeThroughHoles(GRAPH, START, END, [], NETWORK)).toEqual({ kind: 'no-route' });
  });

  it('leaves the stargate graph stargates only, so waypoints still cut at the entrance', () => {
    const route = routeThroughHoles(GRAPH, START, END, [VIA_ENTRY], NETWORK);
    if (route.kind !== 'route') throw new Error('expected a route');
    expect(GRAPH.get(ENTRY)).toEqual([START]);
    expect(waypointSequence([{ from: START, to: END, route }], stargateHopKind(GRAPH))).toEqual({
      waypoints: [ENTRY],
      cutOff: { entrance: ENTRY, exit: THERA, kind: 'wormhole' },
    });
  });
});

describe('legWays', () => {
  it('lists gates only, and each hub with a hole, by the cheapest way through it', () => {
    expect(legWays(GRAPH, START, END, NETWORK, ALL_HOLES)).toEqual([
      { way: 'gates', route: { kind: 'route', systems: BY_GATE } },
      { way: 'thera', route: { kind: 'route', systems: THROUGH_THERA } },
      { way: 'turnur', route: { kind: 'route', systems: [START, W1, W2, TURNUR, TEXIT, END] } },
    ]);
  });

  it('is gates only when no hole qualifies', () => {
    expect(legWays(GRAPH, START, END, {}, [])).toEqual([
      { way: 'gates', route: { kind: 'route', systems: BY_GATE } },
    ]);
  });

  it('always lists gates only, even when no gate route flies the leg', () => {
    expect(legWays(GRAPH, START, ISLAND, NETWORK, ALL_HOLES)).toEqual([
      { way: 'gates', route: { kind: 'no-route' } },
    ]);
  });
});

describe('leg pins', () => {
  it('reads gates, a hub, or a hole id, and nothing else', () => {
    expect(parseLegPin('gates')).toEqual({ kind: 'gates' });
    expect(parseLegPin('thera')).toEqual({ kind: 'hub', hub: 'thera' });
    expect(parseLegPin('turnur')).toEqual({ kind: 'hub', hub: 'turnur' });
    expect(parseLegPin('48213')).toEqual({ kind: 'hole', id: '48213' });
    expect(parseLegPin('scout-7')).toEqual({ kind: 'hole', id: 'scout-7' });
    expect(parseLegPin('')).toBeNull();
    expect(parseLegPin('<script>')).toBeNull();
  });

  it('writes each pin back as the token it was read from', () => {
    for (const token of ['gates', 'thera', 'turnur', '48213']) {
      const pin = parseLegPin(token);
      expect(pin && legPinToken(pin)).toBe(token);
    }
  });
});

describe('pinnedLegRoute', () => {
  const lists = { qualifying: ALL_HOLES, listed: ALL_HOLES };

  it('flies a gates pin by stargate alone', () => {
    expect(pinnedLegRoute(GRAPH, START, END, { kind: 'gates' }, NETWORK, lists)).toEqual({
      kind: 'route',
      systems: BY_GATE,
      hole: null,
    });
  });

  it('flies a hub pin through that hub', () => {
    expect(
      pinnedLegRoute(GRAPH, START, END, { kind: 'hub', hub: 'turnur' }, NETWORK, lists)
    ).toEqual({ kind: 'route', systems: [START, W1, W2, TURNUR, TEXIT, END], hole: null });
  });

  it('says so when a hub pin has no qualifying hole', () => {
    expect(
      pinnedLegRoute(GRAPH, START, END, { kind: 'hub', hub: 'turnur' }, NETWORK, {
        qualifying: THERA_HOLES,
        listed: ALL_HOLES,
      })
    ).toEqual({ kind: 'no-hole' });
  });

  it('flies a hole pin through that hole, even one the filters would skip', () => {
    expect(
      pinnedLegRoute(GRAPH, START, END, { kind: 'hole', id: '3' }, holeNetwork([VIA_EXIT]), {
        qualifying: [VIA_EXIT],
        listed: ALL_HOLES,
      })
    ).toEqual({ kind: 'route', systems: [START, F1, F2, FAR, THERA, EXIT, END], hole: VIA_FAR });
  });

  it('says so when a pinned hole has closed or left the list', () => {
    expect(pinnedLegRoute(GRAPH, START, END, { kind: 'hole', id: '99' }, NETWORK, lists)).toEqual({
      kind: 'closed',
    });
  });

  it('is no-route when the pinned way cannot fly the leg', () => {
    expect(pinnedLegRoute(GRAPH, START, ISLAND, { kind: 'gates' }, NETWORK, lists)).toEqual({
      kind: 'no-route',
    });
  });
});

/**
 *   W1 ═ W4        an Ansiblex: START ─ W1 ═ W4 ─ END is three jumps
 */
const BRIDGE: AnsiblexGate = { fromId: W1, toId: W4, name: 'W1 » W4 - Bridge' };
const BY_BRIDGE = [START, W1, W4, END];

describe('routeOverBridges', () => {
  it('flies the leg by gates and bridges, leaving the holes out', () => {
    expect(routeOverBridges(GRAPH, START, END, [BRIDGE], NETWORK)).toEqual({
      kind: 'route',
      systems: BY_BRIDGE,
    });
  });

  it('is no-route when no bridge is crossed: that is the gate way, not a way over bridges', () => {
    const offTheWay: AnsiblexGate = { fromId: F1, toId: FAR, name: 'F1 » FAR' };
    expect(routeOverBridges(GRAPH, START, END, [offTheWay], {})).toEqual({ kind: 'no-route' });
    expect(routeOverBridges(GRAPH, START, END, [], {})).toEqual({ kind: 'no-route' });
  });
});

describe('legWays with bridges', () => {
  it('lists Via Ansiblex after the hubs when a bridge flies the leg', () => {
    const options = { ...NETWORK, extraConnections: [...NETWORK.extraConnections, [W1, W4]] };
    expect(
      legWays(GRAPH, START, END, options as typeof NETWORK, ALL_HOLES, [BRIDGE]).map(
        (way) => way.way
      )
    ).toEqual(['gates', 'thera', 'turnur', 'ansiblex']);
  });

  it('keeps gates only by stargate alone, even when the planner may cross bridges', () => {
    const [gates] = legWays(
      GRAPH,
      START,
      END,
      { extraConnections: bridgeConnections([BRIDGE]) },
      [],
      [BRIDGE]
    );
    expect(gates).toEqual({ way: 'gates', route: { kind: 'route', systems: BY_GATE } });
  });

  it('leaves Via Ansiblex out when no bridge is on the way', () => {
    expect(legWays(GRAPH, START, END, {}, [], []).map((way) => way.way)).toEqual(['gates']);
  });
});

describe('ansiblex pins', () => {
  it('reads and writes ansiblex as its own pin, never a hole id', () => {
    expect(parseLegPin('ansiblex')).toEqual({ kind: 'ansiblex' });
    expect(legPinToken({ kind: 'ansiblex' })).toBe('ansiblex');
  });

  it('flies an ansiblex pin over the bridges', () => {
    expect(
      pinnedLegRoute(
        GRAPH,
        START,
        END,
        { kind: 'ansiblex' },
        {},
        {
          qualifying: [],
          listed: [],
          bridges: [BRIDGE],
        }
      )
    ).toEqual({ kind: 'route', systems: BY_BRIDGE, hole: null });
  });

  it('says so when no gate is known, or none is on the way', () => {
    const pin = { kind: 'ansiblex' } as const;
    expect(pinnedLegRoute(GRAPH, START, END, pin, {}, { qualifying: [], listed: [] })).toEqual({
      kind: 'no-bridge',
    });
    expect(
      pinnedLegRoute(
        GRAPH,
        START,
        ISLAND,
        pin,
        {},
        {
          qualifying: [],
          listed: [],
          bridges: [BRIDGE],
        }
      )
    ).toEqual({ kind: 'no-route' });
  });

  it('cuts the waypoints at the bridge’s entrance, as a bridge', () => {
    const sequence = waypointSequence(
      [{ from: START, to: END, route: { kind: 'route', systems: BY_BRIDGE } }],
      bridgeHopKind(GRAPH, bridgeStepFinder(GRAPH, [BRIDGE]))
    );
    expect(sequence.cutOff).toEqual({ entrance: W1, exit: W4, kind: 'bridge' });
  });
});
