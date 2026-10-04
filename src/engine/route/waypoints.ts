/**
 * The waypoints a trip sets in the EVE client (issue #2479).
 *
 * The client's autopilot (ESI `POST /ui/autopilot/waypoint`) takes system,
 * station or structure ids and routes between them by stargate, with its own
 * settings. It cannot fly a wormhole or a jump bridge — so a trip that uses
 * one sets waypoints only up to that hop's entrance, and says where to pick up.
 */
import type { JumpGraph } from './jumpRoute';
import type { TripLeg } from './tripPlan';

/** How one hop of a leg is flown. Anything but `gate` is beyond the client's autopilot. */
export type HopKind = 'gate' | 'wormhole' | 'bridge';

export interface WaypointCutOff {
  /** The last system the client can be routed to: where the hop is taken. */
  entrance: number;
  /** Where the hop comes out: where the pilot sets the rest from. */
  exit: number;
  kind: Exclude<HopKind, 'gate'>;
}

export interface WaypointSequence {
  /** Solar system ids, in flying order: the first clears the client's waypoints. */
  waypoints: number[];
  /** Set when a non-gate hop ends the sequence early. */
  cutOff: WaypointCutOff | null;
}

/**
 * Hop kinds read off the stargate graph alone: neighbours are a gate, any
 * other hop is a wormhole. Pass the plain stargate graph — not one with hole
 * edges merged in — or a hole hop would read as a gate.
 */
export function stargateHopKind(gates: JumpGraph): (from: number, to: number) => HopKind {
  return (from, to) => (gates.get(from)?.includes(to) ? 'gate' : 'wormhole');
}

/**
 * Hop kinds with the known Ansiblex (issue #2478): a step a stargate does not
 * join but a known bridge does is a bridge; the rest reads off the stargates.
 * The bridges come per search, never inside the stargate graph.
 */
export function bridgeHopKind(
  gates: JumpGraph,
  bridgeAt: (from: number, to: number) => unknown
): (from: number, to: number) => HopKind {
  const byGate = stargateHopKind(gates);
  return (from, to) => {
    const kind = byGate(from, to);
    return kind !== 'gate' && bridgeAt(from, to) ? 'bridge' : kind;
  };
}

/**
 * Each leg's Stop in flying order, cut at the first non-gate hop: the
 * sequence then ends at that hop's entrance. A leg with no route ends the
 * sequence too — the client could not fly it either.
 */
export function waypointSequence(
  legs: readonly TripLeg[],
  hopKind: (from: number, to: number) => HopKind
): WaypointSequence {
  const waypoints: number[] = [];
  const add = (system: number) => {
    if (waypoints[waypoints.length - 1] !== system) waypoints.push(system);
  };

  for (const leg of legs) {
    if (leg.route.kind !== 'route') break;
    const { systems } = leg.route;
    for (let index = 1; index < systems.length; index += 1) {
      const entrance = systems[index - 1];
      const exit = systems[index];
      const kind = hopKind(entrance, exit);
      if (kind !== 'gate') {
        // The client only needs routing to the entrance when it isn't the start.
        if (index > 1 || waypoints.length > 0) add(entrance);
        return { waypoints, cutOff: { entrance, exit, kind } };
      }
    }
    if (systems.length > 1) add(leg.to);
  }
  return { waypoints, cutOff: null };
}
