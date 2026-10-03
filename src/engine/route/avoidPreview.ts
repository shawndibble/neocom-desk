/**
 * Route Safety's Avoid preview (issue #2472): what a route would become with
 * one more system in the pilot's Avoided Systems, worked out before anything
 * is saved.
 *
 * Pure, per CLAUDE.md: the caller routes and supplies the figures.
 */

export interface CandidateAvoidInput {
  /** The avoid list the route is drawn with now (`effectiveAvoid`). */
  effective: readonly number[];
  /** The system the pilot is about to avoid. */
  systemId: number;
  /** The stored Avoided Systems. */
  avoidList: readonly number[];
  /** The Avoided Systems switch. */
  avoidListEnabled: boolean;
}

/**
 * The avoid list once the system is added — and, with the Avoided Systems
 * switch off, once it is turned on, which brings in the whole stored list,
 * not only the new entry. Sorted and deduped, like `effectiveAvoid`.
 */
export function candidateAvoid(input: CandidateAvoidInput): number[] {
  const avoid = new Set(input.effective);
  avoid.add(input.systemId);
  if (!input.avoidListEnabled) for (const id of input.avoidList) avoid.add(id);
  return [...avoid].sort((a, b) => a - b);
}

export interface AvoidPreviewOutcome {
  jumps: number;
  /** New jumps less current jumps: can be 0 either way, or negative with other rules changing. */
  jumpDelta: number;
  lowestSecurity: number | null;
  /**
   * The new route still passes through the system. Avoidance is a cost,
   * never a wall, so a trip only possible through it keeps it — told apart
   * from an equal-length detour, which is +0 too.
   */
  stillCrosses: boolean;
}

export function avoidPreviewOutcome(input: {
  currentJumps: number;
  /** The previewed route, start to destination. */
  route: readonly number[];
  systemId: number;
  lowestSecurity: number | null;
}): AvoidPreviewOutcome {
  const jumps = Math.max(0, input.route.length - 1);
  return {
    jumps,
    jumpDelta: jumps - input.currentJumps,
    lowestSecurity: input.lowestSecurity,
    stillCrosses: input.route.includes(input.systemId),
  };
}
