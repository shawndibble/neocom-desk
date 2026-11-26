import { describe, expect, it } from 'vitest';
import { findJumpRoute, jumpDistancesFrom, routeSweepFrom, type JumpGraph } from './jumpRoute';

const HUB = 30000001;
const LOW = 30000002;
const FAR = 30000003;
const A = 30000004;
const B = 30000005;
const C = 30000006;
const ISLAND = 30000007;
const NOT_A_SYSTEM = 39999999;
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
    expect(jumps.get(LOW)).toBe(1);
  });
});

describe('security penalty', () => {
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
    expect(safer(0)).toEqual({ kind: 'route', systems: [S, L, E] });
  });

  it('goes the long way once the penalty makes the lowsec jump dearer than the detour', () => {
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

describe('extra connections and free systems', () => {
  const START = 31000001;
  const W1 = 31000002;
  const W2 = 31000003;
  const W3 = 31000004;
  const W4 = 31000005;
  const END = 31000006;
  const ENTRY = 31000007;
  const HUB = 31000008;
  const EXIT = 31000009;

  const graph: JumpGraph = new Map([
    [START, [W1, ENTRY]],
    [W1, [START, W2]],
    [W2, [W1, W3]],
    [W3, [W2, W4]],
    [W4, [W3, END]],
    [END, [W4, EXIT]],
    [ENTRY, [START]],
    [HUB, []],
    [EXIT, [END]],
  ]);
  const security = new Map([
    [START, 1.0],
    [W1, 0.9],
    [W2, 0.9],
    [W3, 0.9],
    [W4, 0.9],
    [END, 0.9],
    [ENTRY, 0.8],
    [HUB, -0.99],
    [EXIT, 0.9],
  ]);
  const holeSecurityOf = (systemId: number) => security.get(systemId);
  const extraConnections = [
    [ENTRY, HUB],
    [HUB, EXIT],
  ] as const;
  const freeSystems = new Set([HUB]);
  const holes = { extraConnections, freeSystems, securityOf: holeSecurityOf };
  const viaHole = [START, ENTRY, HUB, EXIT, END];
  const byGate = [START, W1, W2, W3, W4, END];
  const penaltyCost = Math.exp(0.15 * 50);

  it('never reaches a gateless hub without the extra connections', () => {
    expect(findJumpRoute(graph, START, HUB)).toEqual({ kind: 'no-route' });
  });

  it('crosses an extra connection both ways, each counting as one jump', () => {
    expect(findJumpRoute(graph, START, END, { ...holes, preference: 'shortest' })).toEqual({
      kind: 'route',
      systems: viaHole,
    });
    expect(findJumpRoute(graph, END, START, { ...holes, preference: 'shortest' })).toEqual({
      kind: 'route',
      systems: [...viaHole].reverse(),
    });
    expect(routeSweepFrom(graph, START, holes).jumps.get(END)).toBe(4);
  });

  it('under Prefer safer, takes the hole only because the hub is free', () => {
    const options = { ...holes, preference: 'prefer-highsec' as const };
    expect(findJumpRoute(graph, START, END, options)).toEqual({ kind: 'route', systems: viaHole });
    expect(routeSweepFrom(graph, START, options).costs.get(END)).toBeCloseTo(0.9 + 1 + 0.9 + 0.9);
    expect(findJumpRoute(graph, START, END, { ...options, freeSystems: undefined })).toEqual({
      kind: 'route',
      systems: byGate,
    });
  });

  it('under Prefer less secure, charges entrance and exit normally and the hub nothing', () => {
    const options = { ...holes, preference: 'avoid-highsec' as const };
    expect(findJumpRoute(graph, START, END, options)).toEqual({ kind: 'route', systems: viaHole });
    expect(routeSweepFrom(graph, START, options).costs.get(END)).toBeCloseTo(3 * penaltyCost + 1);
  });

  it('under Prefer shorter, costs the hub one jump like any other', () => {
    const options = { ...holes, preference: 'shortest' as const };
    expect(routeSweepFrom(graph, START, options).costs.get(END)).toBe(4);
    expect(routeSweepFrom(graph, START, options).costs.get(HUB)).toBe(2);
  });

  it('charges the exit system by the preference, so a lowsec exit loses under Prefer safer', () => {
    const lowExit = new Map(security).set(EXIT, 0.2);
    const options = {
      ...holes,
      preference: 'prefer-highsec' as const,
      securityOf: (systemId: number) => lowExit.get(systemId),
    };
    expect(findJumpRoute(graph, START, END, options)).toEqual({ kind: 'route', systems: byGate });
  });

  it('charges an avoided entrance normally, under every preference', () => {
    for (const preference of ['shortest', 'prefer-highsec', 'avoid-highsec'] as const) {
      const options = { ...holes, preference, avoid: new Set([ENTRY]) };
      expect(findJumpRoute(graph, START, END, options)).toEqual({ kind: 'route', systems: byGate });
    }
  });

  describe('a hub with stargates, as Turnur has', () => {
    const GATED_HUB = 31100001;
    const FAR_END = 31100002;
    const SIDE = 31100003;
    const gatedGraph: JumpGraph = new Map([
      [START, [GATED_HUB]],
      [GATED_HUB, [START, FAR_END]],
      [FAR_END, [GATED_HUB]],
      [SIDE, []],
    ]);
    const gatedSecurity = new Map([
      [START, 1.0],
      [GATED_HUB, 0.39],
      [FAR_END, 0.9],
      [SIDE, 0.9],
    ]);
    const options = {
      preference: 'prefer-highsec' as const,
      securityOf: (systemId: number) => gatedSecurity.get(systemId),
      extraConnections: [[SIDE, GATED_HUB]] as const,
      freeSystems: new Set([GATED_HUB]),
    };

    it('charges the hub as lowsec when entered by stargate, holes or not', () => {
      const sweep = routeSweepFrom(gatedGraph, START, options);
      expect(sweep.routeTo(FAR_END)).toEqual([START, GATED_HUB, FAR_END]);
      expect(sweep.costs.get(GATED_HUB)).toBeCloseTo(penaltyCost);
      expect(sweep.costs.get(FAR_END)).toBeCloseTo(penaltyCost + 0.9);
      const gateOnly = routeSweepFrom(gatedGraph, START, {
        ...options,
        extraConnections: undefined,
      });
      expect(gateOnly.costs.get(GATED_HUB)).toBeCloseTo(penaltyCost);
    });

    it('still makes the hub free when entered through a hole', () => {
      const sweep = routeSweepFrom(gatedGraph, SIDE, options);
      expect(sweep.routeTo(GATED_HUB)).toEqual([SIDE, GATED_HUB]);
      expect(sweep.costs.get(GATED_HUB)).toBe(1);
    });
  });

  it('ignores a connection to a system the graph does not hold', () => {
    const options = {
      ...holes,
      extraConnections: [...extraConnections, [EXIT, 39999998]] as const,
    };
    expect(findJumpRoute(graph, START, 39999998, options)).toEqual({ kind: 'no-route' });
    expect(findJumpRoute(graph, START, END, options)).toEqual({ kind: 'route', systems: viaHole });
  });
});
