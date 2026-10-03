import { describe, expect, it } from 'vitest';
import type { JumpGraph } from './jumpRoute';
import {
  MAX_STOPS,
  optimizeStopOrder,
  pairwiseRouteCosts,
  planTrip,
  type RouteCostMatrix,
} from './tripPlan';

/**
 * A line of systems, so every distance is obvious:
 *
 *   A ─ B ─ C ─ D ─ E        ISLAND (no stargates)
 *
 * and a highsec detour round D, so the preferences disagree:
 *
 *   C ─ LOW ─ E              LOW is lowsec; C ─ D ─ E is highsec
 */
const A = 30000001;
const B = 30000002;
const C = 30000003;
const D = 30000004;
const E = 30000005;
const LOW = 30000006;
const ISLAND = 30000007;

const LINE: JumpGraph = new Map([
  [A, [B]],
  [B, [A, C]],
  [C, [B, D]],
  [D, [C, E]],
  [E, [D]],
  [ISLAND, []],
]);

const SECURITY = new Map([
  [A, 1.0],
  [B, 0.9],
  [C, 0.8],
  [D, 0.7],
  [E, 0.6],
  [LOW, 0.2],
]);
const securityOf = (systemId: number) => SECURITY.get(systemId);

/** A matrix straight from costs; jumps mirror the costs. */
function matrix(costs: (number | null)[][]): RouteCostMatrix {
  return costs.map((row) => row.map((cost) => (cost === null ? null : { cost, jumps: cost })));
}

describe('pairwiseRouteCosts', () => {
  it('reads every pair from the leg search, under the leg options', () => {
    const costs = pairwiseRouteCosts(LINE, [A, C, E]);
    expect(costs.map((row) => row.map((cell) => cell?.jumps))).toEqual([
      [0, 2, 4],
      [2, 0, 2],
      [4, 2, 0],
    ]);
  });

  it('is directed: the cost of entering a system is charged one way only', () => {
    const graph: JumpGraph = new Map([
      [A, [LOW]],
      [LOW, [A]],
    ]);
    const costs = pairwiseRouteCosts(graph, [A, LOW], {
      preference: 'prefer-highsec',
      securityOf,
      securityPenalty: 50,
    });
    expect(costs[0][1]?.cost).toBeCloseTo(Math.exp(7.5));
    expect(costs[1][0]?.cost).toBeCloseTo(0.9);
  });

  it('weights by the preference rather than counting jumps', () => {
    const graph: JumpGraph = new Map([
      [C, [D, LOW]],
      [D, [C, E]],
      [E, [D, LOW]],
      [LOW, [C, E]],
    ]);
    const options = { preference: 'prefer-highsec' as const, securityOf };
    const costs = pairwiseRouteCosts(graph, [C, E], options);
    expect(costs[0][1]).toEqual({ cost: expect.closeTo(1.8, 5) as number, jumps: 2 });
  });

  it('has no cost for a pair no stargate route joins', () => {
    const costs = pairwiseRouteCosts(LINE, [A, ISLAND]);
    expect(costs[0][1]).toBeNull();
    expect(costs[1][0]).toBeNull();
    expect(costs[1][1]).toEqual({ cost: 0, jumps: 0 });
  });
});

describe('optimizeStopOrder', () => {
  it('keeps a single stop as it is', () => {
    expect(
      optimizeStopOrder(
        matrix([
          [0, 3],
          [3, 0],
        ])
      )
    ).toEqual([1]);
  });

  it('finds the cheapest order', () => {
    // From 0: 1 is far, 2 is near, 3 is between them.
    const costs = matrix([
      [0, 9, 1, 5],
      [9, 0, 8, 4],
      [1, 8, 0, 4],
      [5, 4, 4, 0],
    ]);
    expect(optimizeStopOrder(costs)).toEqual([2, 3, 1]);
  });

  it('keeps the typed order when another order only ties it', () => {
    const costs = matrix([
      [0, 2, 2],
      [2, 0, 4],
      [2, 4, 0],
    ]);
    expect(optimizeStopOrder(costs)).toEqual([1, 2]);
  });

  it('counts the way home when returning to start', () => {
    const costs = matrix([
      [0, 1, 5],
      [1, 0, 10],
      [20, 10, 0],
    ]);
    expect(optimizeStopOrder(costs)).toEqual([1, 2]);
    expect(optimizeStopOrder(costs, { returnToStart: true })).toEqual([2, 1]);
  });

  it('keeps the last stop last when asked', () => {
    const costs = matrix([
      [0, 9, 1, 5],
      [9, 0, 8, 4],
      [1, 8, 0, 4],
      [5, 4, 4, 0],
    ]);
    expect(optimizeStopOrder(costs, { keepLastStopLast: true })).toEqual([2, 1, 3]);
  });

  it('honours both options together', () => {
    const costs = matrix([
      [0, 6, 1, 3],
      [1, 0, 6, 3],
      [6, 6, 0, 3],
      [30, 3, 3, 0],
    ]);
    // Home from stop 3 is dear, so returning alone flies it in the middle...
    expect(optimizeStopOrder(costs, { returnToStart: true })).toEqual([2, 3, 1]);
    // ...but kept last, only the middle moves.
    expect(optimizeStopOrder(costs, { returnToStart: true, keepLastStopLast: true })).toEqual([
      2, 1, 3,
    ]);
  });

  it('cannot order stops a stargate route does not join', () => {
    expect(
      optimizeStopOrder(
        matrix([
          [0, 1, null],
          [1, 0, null],
          [null, null, 0],
        ])
      )
    ).toBeNull();
  });

  it('matches every order tried by hand', () => {
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const n = 7;
    const costs = Array.from({ length: n + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === j ? 0 : Math.round(random() * 50) + 1))
    );
    const order = optimizeStopOrder(matrix(costs), { returnToStart: true });
    const total = (stops: number[]) =>
      [0, ...stops, 0]
        .slice(1)
        .reduce(
          (sum, stop, index, list) => sum + costs[index === 0 ? 0 : list[index - 1]][stop],
          0
        );
    let best = Number.POSITIVE_INFINITY;
    const permute = (rest: number[], picked: number[]) => {
      if (rest.length === 0) best = Math.min(best, total(picked));
      rest.forEach((stop, index) =>
        permute([...rest.slice(0, index), ...rest.slice(index + 1)], [...picked, stop])
      );
    };
    permute([1, 2, 3, 4, 5, 6, 7], []);
    expect(order && total(order)).toBe(best);
  });

  it(`orders the most stops a trip allows (${MAX_STOPS}) quickly`, () => {
    const n = MAX_STOPS;
    const costs = Array.from({ length: n + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => Math.abs(i - j) * (((i * 7 + j * 3) % 5) + 1))
    );
    const started = performance.now();
    expect(optimizeStopOrder(matrix(costs))).toHaveLength(n);
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('planTrip', () => {
  it('flies one stop as a single leg', () => {
    const plan = planTrip(LINE, A, [C]);
    expect(plan.legs).toEqual([{ from: A, to: C, route: { kind: 'route', systems: [A, B, C] } }]);
    expect(plan.reordered).toBeNull();
    expect(plan.unreachable).toBe(false);
  });

  it('flies the stops in the typed order when not optimizing', () => {
    const plan = planTrip(LINE, C, [E, A]);
    expect(plan.legs.map((leg) => [leg.from, leg.to])).toEqual([
      [C, E],
      [E, A],
    ]);
    expect(plan.reordered).toBeNull();
  });

  it('reorders the legs and states the jumps before and after', () => {
    const plan = planTrip(LINE, A, [E, B, D], {}, { optimize: true });
    expect(plan.legs.map((leg) => [leg.from, leg.to])).toEqual([
      [A, B],
      [B, D],
      [D, E],
    ]);
    expect(plan.reordered).toEqual({ stops: [B, D, E], typedJumps: 9, jumps: 4 });
  });

  it('says nothing when the typed order is already the best', () => {
    const plan = planTrip(LINE, A, [B, D, E], {}, { optimize: true });
    expect(plan.reordered).toBeNull();
  });

  it('adds the way home as a last leg when returning to start', () => {
    const plan = planTrip(LINE, C, [A, E], {}, { optimize: true, returnToStart: true });
    expect(plan.legs.map((leg) => [leg.from, leg.to])).toEqual([
      [C, A],
      [A, E],
      [E, C],
    ]);
  });

  it('keeps the last stop last', () => {
    const plan = planTrip(LINE, A, [E, B, C], {}, { optimize: true, keepLastStopLast: true });
    expect(plan.legs.map((leg) => leg.to)).toEqual([B, E, C]);
    expect(plan.reordered).toEqual({ stops: [B, E, C], typedJumps: 8, jumps: 6 });
  });

  it('flies the typed order with a no-route leg when a stop cannot be reached', () => {
    const plan = planTrip(LINE, A, [ISLAND, C], {}, { optimize: true });
    expect(plan.unreachable).toBe(true);
    expect(plan.reordered).toBeNull();
    expect(plan.legs).toEqual([
      { from: A, to: ISLAND, route: { kind: 'no-route' } },
      { from: ISLAND, to: C, route: { kind: 'no-route' } },
    ]);
  });

  it('flags an unreachable stop even when not optimizing', () => {
    expect(planTrip(LINE, A, [ISLAND]).unreachable).toBe(true);
  });
});
