/**
 * What a Haul leg's timeline row reads from the leg and its systems: the
 * security condition it flies through, the waypoint ids it sets, and whether
 * the hold is full. Conditions only, never a verdict (decision 20260912-172628).
 */
import { mergeStacks, type HaulLeg, type HaulStack } from './haulPlan';
import type { RouteSafetyRow } from './routeSafety';

export type LegCondition =
  | { kind: 'highsec' }
  | { kind: 'lowsec'; count: number }
  | { kind: 'nullsec'; count: number }
  | { kind: 'unknown' };

/** The worst security band the leg crosses, with how many systems sit in it. */
export function legCondition(rows: readonly RouteSafetyRow[]): LegCondition {
  const count = (band: RouteSafetyRow['band']) => rows.filter((r) => r.band === band).length;
  if (count('nullsec') > 0) return { kind: 'nullsec', count: count('nullsec') };
  if (count('lowsec') > 0) return { kind: 'lowsec', count: count('lowsec') };
  return rows.length === 0 || count(null) > 0 ? { kind: 'unknown' } : { kind: 'highsec' };
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

/** One load in a hold: where it was picked up, and how much. */
export interface HeldLoad {
  place: string;
  m3: number;
  /** What the load is made of; absent for a haul saved before items. */
  stacks?: HaulStack[];
}

/** The items across `loads`, merged by type; `null` when no load has an item list. */
export function heldItems(loads: readonly HeldLoad[]): HaulStack[] | null {
  const listed = loads.flatMap((l) => l.stacks ?? []);
  return listed.length === 0 ? null : mergeStacks(listed);
}

/**
 * What a leg's hold carries, from the plan's own legs. A trip chains its
 * pickups with the hold carried forward, so the first pickup leg flies empty,
 * a later one carries the trip's earlier pickups, and the delivery carries
 * them all. A pickup leg also loads at its end; `loadsOnArrival` says what.
 */
export function legHold(
  legs: readonly HaulLeg[],
  leg: HaulLeg
): { aboard: HeldLoad[]; loadsOnArrival: HeldLoad | null } {
  const at = legs.indexOf(leg);
  const aboard = legs
    .filter((l, i) => l.trip === leg.trip && l.kind === 'pickup' && i < at)
    .map((l) => ({ place: l.to.name, m3: l.m3, stacks: l.stacks }));
  return {
    aboard,
    loadsOnArrival:
      leg.kind === 'pickup' ? { place: leg.to.name, m3: leg.m3, stacks: leg.stacks } : null,
  };
}

/** What the pilot does at the stop a leg ends at. */
export type StopAction =
  | { kind: 'load' | 'drop'; m3: number; stacks: HaulStack[] | null }
  | { kind: 'take'; ships: string[] };

/**
 * What happens where `leg` ends: a pickup loads its items, a delivery drops
 * everything aboard (the trip's pickups, merged by type), a pickup flight
 * takes the ship, and a flight's delivery does nothing. `stacks` is `null`
 * for a haul saved before items, so the stop has nothing to unfold.
 */
export function legStopAction(legs: readonly HaulLeg[], leg: HaulLeg): StopAction | null {
  if (leg.ships) return leg.kind === 'pickup' ? { kind: 'take', ships: leg.ships } : null;
  if (leg.kind === 'pickup') {
    return { kind: 'load', m3: leg.m3, stacks: leg.stacks?.length ? leg.stacks : null };
  }
  return { kind: 'drop', m3: leg.m3, stacks: heldItems(legHold(legs, leg).aboard) };
}

/** A place name as the system, then the rest (station, moon) for a dimmer second line. */
export function splitPlaceName(name: string): { system: string; detail: string | null } {
  const at = name.indexOf(' - ');
  return at < 0
    ? { system: name, detail: null }
    : { system: name.slice(0, at), detail: name.slice(at + 3) };
}
