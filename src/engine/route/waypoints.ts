/**
 * The waypoints a trip sets in the EVE client (issue #2479).
 *
 * The client's autopilot (ESI `POST /ui/autopilot/waypoint`) takes system,
 * station or structure ids and routes between them by stargate, with its own
 * settings. It cannot fly a wormhole or a jump bridge — so a trip that uses
 * one sets waypoints only up to that hop's entrance, and says where to pick up.
 *
 * How each hop was flown is the trip's own row tag (issue #2546,
 * `routeSafetyTrip.ts`): this never reads the stargate graph itself.
 */

/** How one hop of a leg is flown. Anything but `gate` is beyond the client's autopilot. */
export type HopKind = 'gate' | 'hole' | 'bridge';

/** A leg as the trip lays it out: its systems in flying order, each tagged with how it was entered. */
export interface WaypointLeg {
  to: number;
  /** `null` when no route flies the leg. The first row was not entered: it is `null`. */
  rows: readonly { systemId: number; entry: { kind: HopKind } | null }[] | null;
}

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
 * Each leg's Stop in flying order, cut at the first non-gate hop: the
 * sequence then ends at that hop's entrance. A leg with no route ends the
 * sequence too — the client could not fly it either.
 */
export function waypointSequence(legs: readonly WaypointLeg[]): WaypointSequence {
  const waypoints: number[] = [];
  const add = (system: number) => {
    if (waypoints[waypoints.length - 1] !== system) waypoints.push(system);
  };

  for (const leg of legs) {
    if (leg.rows === null) break;
    const { rows } = leg;
    for (let index = 1; index < rows.length; index += 1) {
      const entrance = rows[index - 1].systemId;
      const { systemId: exit, entry } = rows[index];
      if (entry !== null && entry.kind !== 'gate') {
        // The client only needs routing to the entrance when it isn't the start.
        if (index > 1 || waypoints.length > 0) add(entrance);
        return { waypoints, cutOff: { entrance, exit, kind: entry.kind } };
      }
    }
    if (rows.length > 1) add(leg.to);
  }
  return { waypoints, cutOff: null };
}
