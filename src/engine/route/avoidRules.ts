/**
 * Which systems a route should keep out of, from the pilot's Travel Settings —
 * the in-game autopilot's avoidance options, gathered into one list every
 * jump count is given (`engine/route/jumpRoute.ts`, and ESI's `avoid`).
 *
 * Also what one more Avoid does to a trip: the list it is planned with
 * (`candidateAvoid`) and the change it makes (`avoidPreviewOutcome`).
 *
 * Pure, per CLAUDE.md: the caller supplies the lists, the kill counts and
 * the planned trips.
 */
import { summarizeTrip, type RouteSafetyRow } from './routeSafety';
export interface AvoidRules {
  /** The pilot's own Avoided Systems. */
  avoidList: readonly number[];
  /** Off routes through the list without the pilot having to clear it. */
  avoidListEnabled: boolean;
  avoidEdencom: boolean;
  edencomSystems: readonly number[];
  avoidTriglavian: boolean;
  triglavianSystems: readonly number[];
  avoidPodKills: boolean;
  /** Pod kills in the feed's window at or above which a system is avoided. */
  podKillThreshold: number;
  /** Pod kills by system, or `null` when the feed could not be read. */
  podKillsBySystem: ReadonlyMap<number, number> | null;
}

/** Sorted and deduped, so equal rules give an equal list — and an equal cache key. */
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

/**
 * A short, stable name for an avoid list — its size and an FNV-1a hash of the
 * ids, base 36 — for keys that would otherwise carry 140+ ids each. Empty for
 * an empty list.
 */
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

/**
 * The avoid list an Avoid preview plans with (issue #2472): the list the
 * route is drawn with now, plus the system — and, with the Avoided Systems
 * switch off, the whole stored list too, since confirming switches it on.
 * Sorted and deduped, like `effectiveAvoid`.
 */
export function candidateAvoid(input: {
  /** The avoid list the route is drawn with now (`effectiveAvoid`). */
  effective: readonly number[];
  /** The system the pilot is about to avoid. */
  systemId: number;
  /** The stored Avoided Systems. */
  avoidList: readonly number[];
  /** The Avoided Systems switch. */
  avoidListEnabled: boolean;
}): number[] {
  const avoid = new Set(input.effective);
  avoid.add(input.systemId);
  if (!input.avoidListEnabled) for (const id of input.avoidList) avoid.add(id);
  return [...avoid].sort((a, b) => a - b);
}

export interface AvoidPreviewOutcome {
  jumps: number;
  /** New jumps less current: 0 either way, or negative with other rules changing. */
  jumpDelta: number;
  lowestSecurity: number | null;
  /**
   * The new trip still passes through the system. Avoidance is a cost, never
   * a wall, so a trip only possible through it keeps it — told apart from an
   * equal-length detour, which is +0 too.
   */
  stillCrosses: boolean;
}

/** Each leg's rows in flying order, `null` for a leg no route flies. */
type TripLegRows = readonly (readonly RouteSafetyRow[] | null)[];

/** The routed legs, summed the way the trip's facts line is. */
function tripSummary(legs: TripLegRows) {
  return summarizeTrip(legs.filter((rows): rows is readonly RouteSafetyRow[] => rows !== null));
}

/**
 * An Avoid preview (issue #2547): the trip re-planned with one more system
 * avoided, against the trip as drawn. Both are whole trips — a stop order
 * that moves elsewhere counts — and a leg with no route is left out of both
 * alike: avoiding only adds cost, so it cannot open or close a leg.
 */
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
