import { describe, expect, it } from 'vitest';
import { findJumpRoute, jumpDistancesFrom, routeSweepFrom, type JumpGraph } from './jumpRoute';

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

describe('avoided systems', () => {
  it('detours around an avoided system', () => {
    const route = findJumpRoute(GRAPH, HUB, FAR, { avoid: new Set([LOW]) });
    expect(route).toEqual({ kind: 'route', systems: [HUB, A, B, C, FAR] });
  });

  /*
   * The same rule the security bias follows: a cost, never a wall. A
   * destination only reachable through an avoided system still has a route,
   * or every haul past a chokepoint would read as unreachable.
   */
  it('still goes through an avoided system when it is the only way', () => {
    const route = findJumpRoute(GRAPH, HUB, UNCHARTED, { avoid: new Set([FAR]) });
    expect(route.kind === 'route' && route.systems).toContain(FAR);
  });

  it('crosses as few avoided systems as it can', () => {
    const route = findJumpRoute(GRAPH, HUB, FAR, { avoid: new Set([A, B, LOW]) });
    expect(route).toEqual({ kind: 'route', systems: [HUB, LOW, FAR] });
  });

  it('outranks the security preference', () => {
    const route = findJumpRoute(GRAPH, HUB, FAR, {
      preference: 'prefer-highsec',
      securityOf,
      avoid: new Set([B]),
    });
    expect(route).toEqual({ kind: 'route', systems: [HUB, LOW, FAR] });
  });

  it('routes to and from an avoided system as though it were not', () => {
    const avoid = new Set([HUB, FAR]);
    expect(findJumpRoute(GRAPH, HUB, FAR, { avoid })).toEqual(findJumpRoute(GRAPH, HUB, FAR));
    expect(findJumpRoute(GRAPH, FAR, HUB, { avoid })).toEqual(findJumpRoute(GRAPH, FAR, HUB));
  });

  it('counts the detour in a sweep', () => {
    const jumps = jumpDistancesFrom(GRAPH, HUB, { avoid: new Set([LOW]) });
    expect(jumps.get(FAR)).toBe(4);
    // LOW itself is still one jump away: reaching it is not passing through it.
    expect(jumps.get(LOW)).toBe(1);
  });
});

/*
 * CCP's own route costs (developers.eveonline.com "Route Calculation"), so a
 * local route agrees with ESI's and the game's: the system jumped into costs
 * exp(0.15 × penalty) when unwanted, twice that for nullsec, and 0.9 when
 * wanted. Raw security, 0.45 the highsec line.
 */
describe('security penalty', () => {
  //   S ─ H1 ─ H2 ─ H3 ─ E      four jumps, highsec
  //   S ─ L ─ E                 two jumps through one 0.4 system
  const S = 1;
  const H1 = 2;
  const H2 = 3;
  const H3 = 4;
  const L = 5;
  const E = 6;
  const graph: JumpGraph = new Map([
    [S, [H1, L]],
    [H1, [S, H2]],
    [H2, [H1, H3]],
    [H3, [H2, E]],
    [L, [S, E]],
    [E, [H3, L]],
  ]);
  const security = new Map([
    [S, 1.0],
    [H1, 0.9],
    [H2, 0.9],
    [H3, 0.9],
    [L, 0.4],
    [E, 1.0],
  ]);
  const securityOfSmall = (id: number) => security.get(id);
  const safer = (securityPenalty: number) =>
    findJumpRoute(graph, S, E, {
      preference: 'prefer-highsec',
      securityOf: securityOfSmall,
      securityPenalty,
    });

  it('takes the lowsec shortcut at penalty 0, where it costs no more than a highsec jump', () => {
    // Two jumps at 1 + 0.9 = 1.9 beat four at 0.9 each = 3.6.
    expect(safer(0)).toEqual({ kind: 'route', systems: [S, L, E] });
  });

  it('goes the long way once the penalty makes the lowsec jump dearer than the detour', () => {
    // exp(0.15 × 10) ≈ 4.48 + 0.9 = 5.38 against 3.6.
    expect(safer(10)).toEqual({ kind: 'route', systems: [S, H1, H2, H3, E] });
  });

  it('defaults to the game default of 50', () => {
    const route = findJumpRoute(graph, S, E, {
      preference: 'prefer-highsec',
      securityOf: securityOfSmall,
    });
    expect(route).toEqual(safer(50));
    expect(route).toEqual({ kind: 'route', systems: [S, H1, H2, H3, E] });
  });

  it('reads 0.45 as highsec, on the raw status rather than the rounded one', () => {
    // 0.449 shows as 0.4 in game but 0.45 does not round down: both sides of the line.
    const nearLine = new Map(security).set(L, 0.45);
    const route = findJumpRoute(graph, S, E, {
      preference: 'prefer-highsec',
      securityOf: (id) => nearLine.get(id),
    });
    expect(route).toEqual({ kind: 'route', systems: [S, L, E] });
  });

  it('keeps Avoided Systems above even the harshest penalty', () => {
    const lowsecDetour = new Map(security).set(H2, 0.1);
    const route = findJumpRoute(graph, S, E, {
      preference: 'prefer-highsec',
      securityOf: (id) => lowsecDetour.get(id),
      securityPenalty: 100,
      avoid: new Set([L]),
    });
    expect(route).toEqual({ kind: 'route', systems: [S, H1, H2, H3, E] });
  });
});

describe('routeSweepFrom', () => {
  it('costs one per jump under the shortest preference', () => {
    const sweep = routeSweepFrom(GRAPH, HUB, { preference: 'shortest', securityOf });
    expect(sweep.costs.get(FAR)).toBe(2);
    expect(sweep.jumps.get(FAR)).toBe(2);
    expect(sweep.costs.get(HUB)).toBe(0);
  });

  it('weights the cost by the preference while still counting jumps', () => {
    const sweep = routeSweepFrom(GRAPH, HUB, {
      preference: 'prefer-highsec',
      securityOf,
      securityPenalty: 50,
    });
    // The long highsec way round: four wanted jumps at 0.9 each.
    expect(sweep.costs.get(FAR)).toBeCloseTo(3.6);
    expect(sweep.jumps.get(FAR)).toBe(4);
  });

  it('charges an avoided system its penalty', () => {
    const sweep = routeSweepFrom(GRAPH, HUB, { avoid: new Set([FAR]) });
    expect(sweep.costs.get(FAR)).toBeGreaterThan(1e12);
  });

  it('gives the same route a single-pair lookup does', () => {
    const options = { preference: 'prefer-highsec' as const, securityOf };
    const sweep = routeSweepFrom(GRAPH, HUB, options);
    const single = findJumpRoute(GRAPH, HUB, UNCHARTED, options);
    expect(sweep.routeTo(UNCHARTED)).toEqual(single.kind === 'route' ? single.systems : null);
    expect(sweep.routeTo(HUB)).toEqual([HUB]);
  });

  it('has no route to a system it cannot reach or does not know', () => {
    const sweep = routeSweepFrom(GRAPH, HUB);
    expect(sweep.costs.has(ISLAND)).toBe(false);
    expect(sweep.routeTo(ISLAND)).toBeNull();
    expect(sweep.routeTo(NOT_A_SYSTEM)).toBeNull();
  });

  it('reaches nothing from an origin the graph does not hold', () => {
    const sweep = routeSweepFrom(GRAPH, NOT_A_SYSTEM);
    expect(sweep.costs.size).toBe(0);
    expect(sweep.routeTo(NOT_A_SYSTEM)).toBeNull();
  });
});
