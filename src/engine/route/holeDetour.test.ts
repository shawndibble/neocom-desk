import { describe, expect, it } from 'vitest';
import { findJumpRoute, jumpDistancesFrom, type JumpGraph } from './jumpRoute';
import { findFlownRoute, flownJumpDistancesFrom } from './holeDetour';
import { jumpCountsForRoutes } from './jumpCounts';
import { routeSafetyNetwork } from './routeSafetyTrip';
import { HUB_SYSTEM_IDS } from './theraConnections';

/**
 *   START ─ W1 ─ W2 ─ W3 ─ W4 ─ END          the gate way, five jumps; W2 is lowsec
 *   START ─ F1 ─ F2 ─ FAR ⤳ THERA ⤳ EXIT ─ END   six jumps through Thera, all highsec
 *   W1 ═ W4                                   an Ansiblex
 */
const START = 30000001;
const W1 = 30000002;
const W2 = 30000003;
const W3 = 30000004;
const W4 = 30000005;
const END = 30000006;
const EXIT = 30000008;
const F1 = 30000009;
const F2 = 30000010;
const FAR = 30000011;
const THERA = HUB_SYSTEM_IDS.thera;

const GRAPH: JumpGraph = new Map([
  [START, [W1, F1]],
  [W1, [START, W2]],
  [W2, [W1, W3]],
  [W3, [W2, W4]],
  [W4, [W3, END]],
  [END, [W4, EXIT]],
  [EXIT, [END]],
  [F1, [START, F2]],
  [F2, [F1, FAR]],
  [FAR, [F2]],
  [THERA, []],
]);

const HOLES = [
  { exitSystemId: FAR, hub: 'thera' as const },
  { exitSystemId: EXIT, hub: 'thera' as const },
];

/** Safer: lowsec W2 costs far more than the six highsec jumps through Thera. */
const SAFER = {
  preference: 'prefer-highsec' as const,
  securityOf: (id: number) => (id === W2 ? 0.3 : 1),
  ...routeSafetyNetwork(HOLES, []),
};

const BY_GATE = [START, W1, W2, W3, W4, END];

describe('findFlownRoute', () => {
  it('flies the gates when the hole route the search picks is more jumps', () => {
    expect(findJumpRoute(GRAPH, START, END, SAFER)).toEqual({
      kind: 'route',
      systems: [START, F1, F2, FAR, THERA, EXIT, END],
    });
    expect(findFlownRoute(GRAPH, START, END, SAFER)).toEqual({ kind: 'route', systems: BY_GATE });
  });

  it('keeps the known bridges on the route it falls back to', () => {
    const options = {
      ...SAFER,
      ...routeSafetyNetwork(HOLES, [{ fromId: W1, toId: W4, name: '' }]),
    };
    expect(findFlownRoute(GRAPH, START, END, options)).toEqual({
      kind: 'route',
      systems: [START, W1, W4, END],
    });
  });

  it('keeps a hole route no longer than the gates', () => {
    expect(findFlownRoute(GRAPH, START, EXIT, SAFER)).toEqual({
      kind: 'route',
      systems: [START, F1, F2, FAR, THERA, EXIT],
    });
  });
});

describe('flownJumpDistancesFrom', () => {
  it('counts each system as findFlownRoute flies it', () => {
    const jumps = flownJumpDistancesFrom(GRAPH, START, SAFER);
    for (const id of [END, EXIT, W4, THERA, FAR]) {
      const route = findFlownRoute(GRAPH, START, id, SAFER);
      expect(jumps.get(id)).toBe(route.kind === 'route' ? route.systems.length - 1 : undefined);
    }
    expect(jumps.get(END)).toBe(5);
    expect(jumps.get(EXIT)).toBe(5);
  });

  it('is the plain sweep when no hole is open', () => {
    const gatesOnly = { preference: SAFER.preference, securityOf: SAFER.securityOf };
    expect(flownJumpDistancesFrom(GRAPH, START, gatesOnly)).toEqual(
      jumpDistancesFrom(GRAPH, START, gatesOnly)
    );
  });
});

describe('jumpCountsForRoutes', () => {
  it('counts a table by the routes Route Safety flies, one origin or many', () => {
    const route = (originSystemId: number, destinationSystemId: number) => ({
      originSystemId,
      destinationSystemId,
    });
    // START asks twice (one sweep); W1 once (one lookup).
    expect(
      jumpCountsForRoutes(GRAPH, [route(START, END), route(START, EXIT), route(W1, END)], SAFER)
    ).toEqual([5, 5, 4]);
  });
});
