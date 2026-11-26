import { mergeStacks, type HaulLeg, type HaulStack } from './haulPlan';
import type { RouteSafetyRow } from './routeSafety';

export type LegCondition =
  | { kind: 'highsec' }
  | { kind: 'lowsec'; count: number }
  | { kind: 'nullsec'; count: number }
  | { kind: 'unknown' };

export function legCondition(rows: readonly RouteSafetyRow[]): LegCondition {
  const count = (band: RouteSafetyRow['band']) => rows.filter((r) => r.band === band).length;
  if (count('nullsec') > 0) return { kind: 'nullsec', count: count('nullsec') };
  if (count('lowsec') > 0) return { kind: 'lowsec', count: count('lowsec') };
  return rows.length === 0 || count(null) > 0 ? { kind: 'unknown' } : { kind: 'highsec' };
}

export function legWaypointIds(leg: HaulLeg): number[] {
  const id = leg.to.stationId ?? leg.to.systemId;
  return id === null ? [] : [id];
}

export function sectionWaypointIds(legs: readonly HaulLeg[]): number[] {
  return legs.flatMap(legWaypointIds).filter((id, index, all) => id !== all[index - 1]);
}

export interface HeldLoad {
  place: string;
  m3: number;
  stacks?: HaulStack[];
}

export function heldItems(loads: readonly HeldLoad[]): HaulStack[] | null {
  const listed = loads.flatMap((l) => l.stacks ?? []);
  return listed.length === 0 ? null : mergeStacks(listed);
}

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

export type StopAction =
  | { kind: 'load' | 'drop'; m3: number; stacks: HaulStack[] | null }
  | { kind: 'take'; ships: string[] };

export function legStopAction(legs: readonly HaulLeg[], leg: HaulLeg): StopAction | null {
  if (leg.ships) return leg.kind === 'pickup' ? { kind: 'take', ships: leg.ships } : null;
  if (leg.kind === 'pickup') {
    return { kind: 'load', m3: leg.m3, stacks: leg.stacks?.length ? leg.stacks : null };
  }
  return { kind: 'drop', m3: leg.m3, stacks: heldItems(legHold(legs, leg).aboard) };
}

export function splitPlaceName(name: string): { system: string; detail: string | null } {
  const at = name.indexOf(' - ');
  return at < 0
    ? { system: name, detail: null }
    : { system: name.slice(0, at), detail: name.slice(at + 3) };
}
