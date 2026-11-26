export type HopKind = 'gate' | 'hole' | 'bridge' | 'jump';

export interface WaypointLeg {
  to: number;
  rows: readonly { systemId: number; entry: { kind: HopKind } | null }[] | null;
}

export interface WaypointCutOff {
  entrance: number;
  exit: number;
  kind: Exclude<HopKind, 'gate'>;
}

export interface WaypointSequence {
  waypoints: number[];
  cutOff: WaypointCutOff | null;
}

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
        if (index > 1 || waypoints.length > 0) add(entrance);
        return { waypoints, cutOff: { entrance, exit, kind: entry.kind } };
      }
    }
    if (rows.length > 1) add(leg.to);
  }
  return { waypoints, cutOff: null };
}
