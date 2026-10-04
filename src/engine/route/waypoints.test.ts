import { describe, expect, it } from 'vitest';
import { waypointSequence, type HopKind, type WaypointLeg } from './waypoints';

/**
 *   A ─ B ─ C        X ─ Y ─ Z
 *
 * Two gate islands. C → X is no stargate: the hop between them is tagged a
 * hole or a bridge, as the trip assembly tags a row (issue #2546).
 */
const A = 30000001;
const B = 30000002;
const C = 30000003;
const X = 31000001;
const Y = 31000002;
const Z = 31000003;

/** A leg flown by gate, except the steps `hops` names: `[from, to, kind]`. */
function leg(systems: number[], hops: [number, number, HopKind][] = []): WaypointLeg {
  return {
    to: systems[systems.length - 1],
    rows: systems.map((systemId, index) => {
      if (index === 0) return { systemId, entry: null };
      const hop = hops.find(([from, to]) => from === systems[index - 1] && to === systemId);
      return { systemId, entry: { kind: hop?.[2] ?? 'gate' } };
    }),
  };
}

describe('waypointSequence', () => {
  it('is every Stop in flying order on an all-gate trip', () => {
    expect(waypointSequence([leg([A, B]), leg([B, C])])).toEqual({
      waypoints: [B, C],
      cutOff: null,
    });
  });

  it('keeps a Stop the trip returns to, so Return to start comes home', () => {
    expect(waypointSequence([leg([A, B, C]), leg([C, B, A])])).toEqual({
      waypoints: [C, A],
      cutOff: null,
    });
  });

  it('is empty with no legs', () => {
    expect(waypointSequence([])).toEqual({ waypoints: [], cutOff: null });
  });

  it('skips a zero-jump leg that would repeat the waypoint before it', () => {
    expect(waypointSequence([leg([A, B]), leg([B])])).toEqual({
      waypoints: [B],
      cutOff: null,
    });
  });

  it('stops at the entrance of the first hole jump, naming its exit', () => {
    expect(
      waypointSequence([leg([A, B]), leg([B, C, X, Y], [[C, X, 'hole']]), leg([Y, Z])])
    ).toEqual({
      waypoints: [B, C],
      cutOff: { entrance: C, exit: X, kind: 'hole' },
    });
  });

  it('does not repeat a Stop that is itself the entrance', () => {
    expect(waypointSequence([leg([A, B, C]), leg([C, X, Y], [[C, X, 'bridge']])])).toEqual({
      waypoints: [C],
      cutOff: { entrance: C, exit: X, kind: 'bridge' },
    });
  });

  it('sets nothing when the very first hop leaves by a hole', () => {
    expect(waypointSequence([leg([C, X, Y], [[C, X, 'hole']])])).toEqual({
      waypoints: [],
      cutOff: { entrance: C, exit: X, kind: 'hole' },
    });
  });

  it('ends at a leg with no route, setting the Stops before it', () => {
    const noRoute: WaypointLeg = { to: Z, rows: null };
    expect(waypointSequence([leg([A, B]), noRoute, leg([Z, Y])])).toEqual({
      waypoints: [B],
      cutOff: null,
    });
  });
});
