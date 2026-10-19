/** The pure half of `planetSlots.ts`, free of the skills loader so the advice worker can import it. */

/** The most planets any capsuleer can run, at Interplanetary Consolidation V. */
export const PLANET_SLOTS_MAX = 6;

export interface PlanetSlots {
  slots: number;
  /** True when no skill data was available and untrained was assumed. */
  assumed: boolean;
}

/**
 * @param skillLevel Effective (issue #1236: min of queue-corrected trained
 *   and active) Interplanetary Consolidation, or `null` when the app has no
 *   skill data for this character at all.
 *
 * `assumed` keeps a pilot who has never trained the skill distinct from one
 * whose `/skills` has never loaded — the same distinction `customsRateSource`
 * draws for the customs rate and `maxColonyBudget` for the pin budget. Both
 * get one slot, and only the first may be shown as fact.
 */
export function planetSlots(skillLevel: number | null): PlanetSlots {
  const level = Math.min(Math.max(Math.trunc(skillLevel ?? 0), 0), PLANET_SLOTS_MAX - 1);
  return { slots: level + 1, assumed: skillLevel == null };
}
