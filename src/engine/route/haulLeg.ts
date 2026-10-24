/**
 * What a Haul leg's timeline row reads from the leg and its systems: the
 * security condition it flies through, the waypoint ids it sets, and whether
 * the hold is full. Conditions only, never a verdict (decision 20260912-172628).
 */
import type { HaulLeg } from './haulPlan';
import type { RouteSafetyRow } from './routeSafety';

export type LegCondition =
  | { kind: 'highsec' }
  | { kind: 'lowsec'; count: number }
  | { kind: 'nullsec'; count: number }
  | { kind: 'unknown' };

/** The worst security band the leg crosses, with how many systems sit in it. */
export function legCondition(rows: readonly RouteSafetyRow[]): LegCondition {
  if (rows.length === 0 || rows.some((r) => r.band === null)) return { kind: 'unknown' };
  const count = (band: RouteSafetyRow['band']) => rows.filter((r) => r.band === band).length;
  if (count('nullsec') > 0) return { kind: 'nullsec', count: count('nullsec') };
  if (count('lowsec') > 0) return { kind: 'lowsec', count: count('lowsec') };
  return { kind: 'highsec' };
}

/** The stop a leg sets as a waypoint: its station when it has one, else its system. */
export function legWaypointIds(leg: HaulLeg): number[] {
  const id = leg.to.stationId ?? leg.to.systemId;
  return id === null ? [] : [id];
}

/** A Character's legs as one waypoint list, a stop repeated back to back sent once. */
export function sectionWaypointIds(legs: readonly HaulLeg[]): number[] {
  return legs.flatMap(legWaypointIds).filter((id, index, all) => id !== all[index - 1]);
}

/** A pickup leg flies out to load; a delivery leg flies the load in. */
export function legCarry(leg: HaulLeg): 'empty' | 'loaded' {
  return leg.kind === 'delivery' ? 'loaded' : 'empty';
}

/** A place name as the system, then the rest (station, moon) for a dimmer second line. */
export function splitPlaceName(name: string): { system: string; detail: string | null } {
  const at = name.indexOf(' - ');
  return at < 0
    ? { system: name, detail: null }
    : { system: name.slice(0, at), detail: name.slice(at + 3) };
}
