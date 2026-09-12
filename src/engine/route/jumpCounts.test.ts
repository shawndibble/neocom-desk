import { describe, expect, it } from 'vitest';
import { jumpCountsForRoutes } from './jumpCounts';
import type { JumpGraph } from './jumpRoute';

/**
 *   HUB ─ LOW ─ FAR            two jumps, LOW is lowsec
 *   HUB ─ A ─ B ─ C ─ FAR      four jumps, all highsec
 *   ISLAND                     a system with no stargates
 */
const HUB = 30000001;
const LOW = 30000002;
const FAR = 30000003;
const A = 30000004;
const B = 30000005;
const C = 30000006;
const ISLAND = 30000007;

const GRAPH: JumpGraph = new Map([
  [HUB, [LOW, A]],
  [LOW, [HUB, FAR]],
  [FAR, [LOW, C]],
  [A, [HUB, B]],
  [B, [A, C]],
  [C, [B, FAR]],
  [ISLAND, []],
]);

const SECURITY = new Map([
  [HUB, 1.0],
  [LOW, 0.2],
  [FAR, 0.9],
  [A, 0.8],
  [B, 0.7],
  [C, 0.9],
  [ISLAND, 0.5],
]);

const securityOf = (systemId: number) => SECURITY.get(systemId);

describe('jumpCountsForRoutes', () => {
  it('answers in the order it was asked, one entry per route', () => {
    const counts = jumpCountsForRoutes(GRAPH, [
      { originSystemId: HUB, destinationSystemId: FAR },
      { originSystemId: HUB, destinationSystemId: A },
      { originSystemId: C, destinationSystemId: B },
    ]);
    expect(counts).toEqual([2, 1, 1]);
  });

  it('has no distance for a haul with an unplaced end', () => {
    // A player structure resolves to no system, so neither end of the trip is
    // measurable — distinct from a route that exists but is long.
    const counts = jumpCountsForRoutes(GRAPH, [
      { originSystemId: null, destinationSystemId: FAR },
      { originSystemId: HUB, destinationSystemId: null },
      { originSystemId: null, destinationSystemId: null },
    ]);
    expect(counts).toEqual([null, null, null]);
  });

  it('has no distance where no stargate route connects the two ends', () => {
    const counts = jumpCountsForRoutes(GRAPH, [
      { originSystemId: HUB, destinationSystemId: ISLAND },
    ]);
    expect(counts).toEqual([null]);
  });

  it('counts a haul that never leaves its system as zero, not as unavailable', () => {
    const counts = jumpCountsForRoutes(GRAPH, [{ originSystemId: HUB, destinationSystemId: HUB }]);
    expect(counts).toEqual([0]);
  });

  it('follows the preference, so a safer route reads as the longer trip it is', () => {
    const routes = [{ originSystemId: HUB, destinationSystemId: FAR }];
    expect(jumpCountsForRoutes(GRAPH, routes, { preference: 'shortest', securityOf })).toEqual([2]);
    expect(
      jumpCountsForRoutes(GRAPH, routes, { preference: 'prefer-highsec', securityOf })
    ).toEqual([4]);
  });

  it('agrees with itself whether an origin is asked once or many times', () => {
    // The grouping below switches strategy on how many destinations an origin
    // has; both paths must give the same answer.
    const alone = jumpCountsForRoutes(GRAPH, [{ originSystemId: HUB, destinationSystemId: FAR }], {
      preference: 'prefer-highsec',
      securityOf,
    });
    const shared = jumpCountsForRoutes(
      GRAPH,
      [
        { originSystemId: HUB, destinationSystemId: FAR },
        { originSystemId: HUB, destinationSystemId: C },
        { originSystemId: HUB, destinationSystemId: B },
      ],
      { preference: 'prefer-highsec', securityOf }
    );
    expect(shared[0]).toBe(alone[0]);
  });

  it('resolves an origin asked about many destinations in one pass', () => {
    const counts = jumpCountsForRoutes(GRAPH, [
      { originSystemId: HUB, destinationSystemId: LOW },
      { originSystemId: HUB, destinationSystemId: FAR },
      { originSystemId: HUB, destinationSystemId: C },
      { originSystemId: HUB, destinationSystemId: ISLAND },
    ]);
    expect(counts).toEqual([1, 2, 3, null]);
  });

  it('answers an empty ask with an empty result', () => {
    expect(jumpCountsForRoutes(GRAPH, [])).toEqual([]);
  });

  it('has no distance for a system the graph does not hold', () => {
    const counts = jumpCountsForRoutes(GRAPH, [
      { originSystemId: 39999999, destinationSystemId: FAR },
      { originSystemId: HUB, destinationSystemId: 39999999 },
    ]);
    expect(counts).toEqual([null, null]);
  });
});
