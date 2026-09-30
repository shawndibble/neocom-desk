/**
 * Which systems a route should keep out of, from the pilot's Travel Settings —
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
