import { summarizeTrip, type RouteSafetyRow } from './routeSafety';
export interface AvoidRules {
  avoidList: readonly number[];
  avoidListEnabled: boolean;
  avoidEdencom: boolean;
  edencomSystems: readonly number[];
  avoidTriglavian: boolean;
  triglavianSystems: readonly number[];
  avoidPodKills: boolean;
  podKillThreshold: number;
  podKillsBySystem: ReadonlyMap<number, number> | null;
}

export function effectiveAvoid(rules: AvoidRules): number[] {
  const avoid = new Set<number>();
  if (rules.avoidListEnabled) for (const id of rules.avoidList) avoid.add(id);
  if (rules.avoidEdencom) for (const id of rules.edencomSystems) avoid.add(id);
  if (rules.avoidTriglavian) for (const id of rules.triglavianSystems) avoid.add(id);
  if (rules.avoidPodKills && rules.podKillsBySystem) {
    for (const [id, podKills] of rules.podKillsBySystem) {
      if (podKills >= rules.podKillThreshold) avoid.add(id);
    }
  }
  return [...avoid].sort((a, b) => a - b);
}

export function avoidListKey(ids: readonly number[]): string {
  if (ids.length === 0) return '';
  let hash = 0x811c9dc5;
  for (const id of ids) {
    for (const char of `${id},`) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
  }
  return `a${ids.length}:${hash.toString(36)}`;
}

export function candidateAvoid(input: {
  effective: readonly number[];
  systemId: number;
  avoidList: readonly number[];
  avoidListEnabled: boolean;
}): number[] {
  const avoid = new Set(input.effective);
  avoid.add(input.systemId);
  if (!input.avoidListEnabled) for (const id of input.avoidList) avoid.add(id);
  return [...avoid].sort((a, b) => a - b);
}

export interface AvoidPreviewOutcome {
  jumps: number;
  jumpDelta: number;
  lowestSecurity: number | null;
  stillCrosses: boolean;
}

type TripLegRows = readonly (readonly RouteSafetyRow[] | null)[];

function tripSummary(legs: TripLegRows) {
  return summarizeTrip(legs.filter((rows): rows is readonly RouteSafetyRow[] => rows !== null));
}

export function avoidPreviewOutcome(input: {
  current: TripLegRows;
  next: TripLegRows;
  systemId: number;
}): AvoidPreviewOutcome {
  const { jumps, lowestSecurity } = tripSummary(input.next);
  return {
    jumps,
    jumpDelta: jumps - tripSummary(input.current).jumps,
    lowestSecurity,
    stillCrosses: input.next.some((rows) => rows?.some((row) => row.systemId === input.systemId)),
  };
}

export function listOnlyOutcome(current: TripLegRows): AvoidPreviewOutcome {
  return {
    jumps: tripSummary(current).jumps,
    jumpDelta: 0,
    lowestSecurity: null,
    stillCrosses: false,
  };
}
