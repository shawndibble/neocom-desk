import { describe, expect, it } from 'vitest';
import type { JumpGraph } from './jumpRoute';
import type { TripLeg } from './tripPlan';
import { stargateHopKind, waypointSequence, type HopKind } from './waypoints';

/**
 *   A ─ B ─ C        X ─ Y ─ Z
 *
 * Two gate islands. C → X is no stargate: a synthetic wormhole (or bridge)
 * hop stands in for the ones #2476 will put in a leg.
 */
const A = 30000001;
const B = 30000002;
const C = 30000003;
const X = 31000001;
const Y = 31000002;
const Z = 31000003;

const GATES: JumpGraph = new Map([
  [A, [B]],
  [B, [A, C]],
  [C, [B]],
  [X, [Y]],
  [Y, [X, Z]],
  [Z, [Y]],
]);

function leg(...systems: number[]): TripLeg {
  return {
    from: systems[0],
    to: systems[systems.length - 1],
    route: { kind: 'route', systems },
  };
}

const gatesOnly = stargateHopKind(GATES);

describe('waypointSequence', () => {
  it('is every Stop in flying order on an all-gate trip', () => {
    expect(waypointSequence([leg(A, B), leg(B, C)], gatesOnly)).toEqual({
      waypoints: [B, C],
      cutOff: null,
    });
  });

  it('keeps a Stop the trip returns to, so Return to start comes home', () => {
    expect(waypointSequence([leg(A, B, C), leg(C, B, A)], gatesOnly)).toEqual({
      waypoints: [C, A],
      cutOff: null,
    });
  });

  it('is empty with no legs', () => {
    expect(waypointSequence([], gatesOnly)).toEqual({ waypoints: [], cutOff: null });
  });

  it('skips a zero-jump leg that would repeat the waypoint before it', () => {
    expect(waypointSequence([leg(A, B), leg(B)], gatesOnly)).toEqual({
      waypoints: [B],
      cutOff: null,
    });
  });

  it('stops at the entrance of the first non-gate hop, naming its exit', () => {
    const hopKind: (from: number, to: number) => HopKind = (from, to) =>
      from === C && to === X ? 'wormhole' : gatesOnly(from, to);
    expect(waypointSequence([leg(A, B), leg(B, C, X, Y), leg(Y, Z)], hopKind)).toEqual({
      waypoints: [B, C],
      cutOff: { entrance: C, exit: X, kind: 'wormhole' },
    });
  });

  it('does not repeat a Stop that is itself the entrance', () => {
    const hopKind: (from: number, to: number) => HopKind = (from, to) =>
      from === C && to === X ? 'bridge' : gatesOnly(from, to);
    expect(waypointSequence([leg(A, B, C), leg(C, X, Y)], hopKind)).toEqual({
      waypoints: [C],
      cutOff: { entrance: C, exit: X, kind: 'bridge' },
    });
  });

  it('sets nothing when the very first hop leaves by a hole', () => {
    const hopKind: (from: number, to: number) => HopKind = () => 'wormhole';
    expect(waypointSequence([leg(C, X, Y)], hopKind)).toEqual({
      waypoints: [],
      cutOff: { entrance: C, exit: X, kind: 'wormhole' },
    });
  });

  it('ends at a leg with no route, setting the Stops before it', () => {
    const noRoute: TripLeg = { from: B, to: Z, route: { kind: 'no-route' } };
    expect(waypointSequence([leg(A, B), noRoute, leg(Z, Y)], gatesOnly)).toEqual({
      waypoints: [B],
      cutOff: null,
    });
  });
});

describe('stargateHopKind', () => {
  it('calls a hop between gate neighbours a gate, either way', () => {
    expect(gatesOnly(A, B)).toBe('gate');
    expect(gatesOnly(B, A)).toBe('gate');
  });

  it('calls any other hop a wormhole', () => {
    expect(gatesOnly(C, X)).toBe('wormhole');
    expect(gatesOnly(A, C)).toBe('wormhole');
  });
});
