import { describe, expect, it } from 'vitest';
import { findJumpRoute, jumpDistancesFrom, type JumpGraph } from './jumpRoute';

/**
 * A hand-built stand-in for the stargate graph, shaped so the three
 * preferences disagree — which is the only way to tell them apart.
 *
 *   HUB ─ LOW ─ FAR            two jumps, but LOW is lowsec
 *   HUB ─ A ─ B ─ C ─ FAR      four jumps, every one of them highsec
 *
 * So "shortest" takes the lowsec hop, "prefer-highsec" takes the long way
 * round, and "avoid-highsec" takes the lowsec hop for a different reason.
 */
const HUB = 30000001;
const LOW = 30000002;
const FAR = 30000003;
const A = 30000004;
const B = 30000005;
const C = 30000006;
/** In the graph with no stargates at all — J-space's real shape. */
const ISLAND = 30000007;
/** Not in the graph: not a solar system this snapshot knows. */
const NOT_A_SYSTEM = 39999999;
/** In the graph, but absent from the security lookup. */
const UNCHARTED = 30000008;

const GRAPH: JumpGraph = new Map([
  [HUB, [LOW, A]],
  [LOW, [HUB, FAR]],
  [FAR, [LOW, C, UNCHARTED]],
  [A, [HUB, B]],
  [B, [A, C]],
  [C, [B, FAR]],
  [ISLAND, []],
  [UNCHARTED, [FAR]],
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

describe('findJumpRoute', () => {
  it('returns the ordered systems crossed, both ends included', () => {
    const result = findJumpRoute(GRAPH, HUB, FAR, { preference: 'shortest', securityOf });
    expect(result).toEqual({ kind: 'route', systems: [HUB, LOW, FAR] });
  });

  it('takes the fewest jumps when asked for the shortest route', () => {
    const result = findJumpRoute(GRAPH, HUB, FAR, { preference: 'shortest', securityOf });
    expect(result.kind === 'route' && result.systems.length - 1).toBe(2);
  });

  it('takes a longer all-highsec route over a shorter one through lowsec', () => {
    const result = findJumpRoute(GRAPH, HUB, FAR, { preference: 'prefer-highsec', securityOf });
    expect(result).toEqual({ kind: 'route', systems: [HUB, A, B, C, FAR] });
  });

  it('prefers, rather than requires, highsec — it still routes when no highsec path exists', () => {
    // Nothing reaches UNCHARTED except through FAR, and UNCHARTED has no
    // stated security at all. "Prefer" must still deliver a route.
    const result = findJumpRoute(GRAPH, HUB, UNCHARTED, {
      preference: 'prefer-highsec',
      securityOf,
    });
    expect(result.kind).toBe('route');
    expect(result.kind === 'route' && result.systems.at(-1)).toBe(UNCHARTED);
  });

  it('avoids highsec when asked to, taking the lowsec hop', () => {
    const result = findJumpRoute(GRAPH, HUB, FAR, { preference: 'avoid-highsec', securityOf });
    expect(result).toEqual({ kind: 'route', systems: [HUB, LOW, FAR] });
  });

  it('treats a system with no stated security as not highsec, rather than as safe', () => {
    // Routing HUB -> FAR while avoiding highsec must not be tempted through
    // UNCHARTED; more to the point, an unknown security must never let a
    // prefer-highsec route claim a system is safe. FAR -> UNCHARTED is the
    // only edge, so a prefer-highsec route to UNCHARTED still pays for it.
    const viaUncharted = findJumpRoute(GRAPH, FAR, UNCHARTED, {
      preference: 'prefer-highsec',
      securityOf,
    });
    expect(viaUncharted).toEqual({ kind: 'route', systems: [FAR, UNCHARTED] });
  });

  it('reports zero jumps for a haul that never leaves its system', () => {
    const result = findJumpRoute(GRAPH, HUB, HUB, { preference: 'shortest', securityOf });
    expect(result).toEqual({ kind: 'route', systems: [HUB] });
    expect(result.kind === 'route' && result.systems.length - 1).toBe(0);
  });

  it('says no-route rather than zero jumps when the two ends do not connect', () => {
    const result = findJumpRoute(GRAPH, HUB, ISLAND, { preference: 'shortest', securityOf });
    expect(result).toEqual({ kind: 'no-route' });
  });

  it('still reports zero jumps within a gateless system, where you are already there', () => {
    // The snapshot keys every solar system, J-space included, so a haul that
    // starts and ends in one wormhole is zero jumps — not the no-route its
    // empty adjacency would otherwise imply.
    const result = findJumpRoute(GRAPH, ISLAND, ISLAND, { preference: 'shortest', securityOf });
    expect(result).toEqual({ kind: 'route', systems: [ISLAND] });
  });

  it('says no-route when the origin is not a system the snapshot knows', () => {
    const result = findJumpRoute(GRAPH, NOT_A_SYSTEM, FAR, { preference: 'shortest', securityOf });
    expect(result).toEqual({ kind: 'no-route' });
  });

  it('says no-route when the destination is not a system the snapshot knows', () => {
    const result = findJumpRoute(GRAPH, HUB, NOT_A_SYSTEM, { preference: 'shortest', securityOf });
    expect(result).toEqual({ kind: 'no-route' });
  });

  it('claims no distance for an unknown id even to itself, rather than zero jumps', () => {
    // Zero jumps would be a confident answer about a place the snapshot has
    // never heard of; no-route is the honest one.
    const result = findJumpRoute(GRAPH, NOT_A_SYSTEM, NOT_A_SYSTEM, { preference: 'shortest' });
    expect(result).toEqual({ kind: 'no-route' });
  });

  it('routes an empty graph to nothing rather than throwing', () => {
    const result = findJumpRoute(new Map(), HUB, FAR, { preference: 'shortest', securityOf });
    expect(result).toEqual({ kind: 'no-route' });
  });

  it('falls back to shortest behaviour when no security lookup is supplied', () => {
    const result = findJumpRoute(GRAPH, HUB, FAR, { preference: 'prefer-highsec' });
    expect(result).toEqual({ kind: 'route', systems: [HUB, LOW, FAR] });
  });

  it('defaults to the shortest route when no options are given at all', () => {
    expect(findJumpRoute(GRAPH, HUB, FAR)).toEqual({ kind: 'route', systems: [HUB, LOW, FAR] });
  });
});

describe('jumpDistancesFrom', () => {
  it('answers every reachable system in one pass, the origin at zero', () => {
    const distances = jumpDistancesFrom(GRAPH, HUB, { preference: 'shortest', securityOf });
    expect(Object.fromEntries(distances)).toEqual({
      [HUB]: 0,
      [LOW]: 1,
      [A]: 1,
      [FAR]: 2,
      [B]: 2,
      [C]: 3,
      [UNCHARTED]: 3,
    });
  });

  it('counts jumps along the preferred route, not its weighted cost', () => {
    // Under prefer-highsec the route to FAR is the four-jump highsec one, so
    // the distance is 4 — the trip's length, never the penalty arithmetic
    // that chose it.
    const distances = jumpDistancesFrom(GRAPH, HUB, { preference: 'prefer-highsec', securityOf });
    expect(distances.get(FAR)).toBe(4);
    expect(distances.get(C)).toBe(3);
  });

  it('omits what no stargate reaches rather than claiming a distance', () => {
    const distances = jumpDistancesFrom(GRAPH, HUB, { preference: 'shortest', securityOf });
    expect(distances.has(ISLAND)).toBe(false);
  });

  it('reaches nothing at all from a gateless system, but still places itself', () => {
    const distances = jumpDistancesFrom(GRAPH, ISLAND);
    expect(Object.fromEntries(distances)).toEqual({ [ISLAND]: 0 });
  });

  it('answers nothing for an origin the snapshot does not know', () => {
    expect(jumpDistancesFrom(GRAPH, NOT_A_SYSTEM).size).toBe(0);
  });

  it('agrees with the pair lookup for every destination it reports', () => {
    // The two share one search; this pins them together so a future change to
    // either cannot silently drift.
    const distances = jumpDistancesFrom(GRAPH, HUB, { preference: 'prefer-highsec', securityOf });
    for (const [destination, jumps] of distances) {
      const route = findJumpRoute(GRAPH, HUB, destination, {
        preference: 'prefer-highsec',
        securityOf,
      });
      expect(route.kind === 'route' && route.systems.length - 1).toBe(jumps);
    }
  });
});
