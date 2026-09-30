/**
 * Which systems a route should keep out of, from the pilot's Travel settings —
 * the in-game autopilot's avoidance options, gathered into one list every
 * jump count is given (`engine/route/jumpRoute.ts`, and ESI's `avoid`).
 *
 * Pure, per CLAUDE.md: the caller supplies the lists and the kill counts.
 */
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
