import { describe, expect, it } from 'vitest';
import { findJumpRoute, type JumpGraph } from './jumpRoute';

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
/** Reachable from nothing — the disconnected case. */
const ISLAND = 30000007;
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

  it('says no-route when the origin is not in the graph at all', () => {
    const result = findJumpRoute(GRAPH, 39999999, FAR, { preference: 'shortest', securityOf });
    expect(result).toEqual({ kind: 'no-route' });
  });

  it('says no-route when the destination is not in the graph at all', () => {
    const result = findJumpRoute(GRAPH, HUB, 39999999, { preference: 'shortest', securityOf });
    expect(result).toEqual({ kind: 'no-route' });
  });

  it('says no-route for a wormhole-shaped id no stargate reaches, never a distance', () => {
    // J-space carries no stargates, so a wormhole system is simply absent
    // from the graph. That is a fact about the game, and the caller must be
    // able to tell it apart from a route it merely failed to compute.
    const result = findJumpRoute(GRAPH, HUB, 31000042, { preference: 'shortest', securityOf });
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
