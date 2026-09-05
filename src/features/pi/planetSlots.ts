/**
 * How many planets this character can actually run at once.
 *
 * A capsuleer starts with one Command Center slot and gains one more per level
 * of **Interplanetary Consolidation**, so the ceiling is `1 + level` and only
 * a pilot at level V has the six the app used to assert flat. That flat six
 * was a reported bug: it told a pilot at level IV they had a planet they did
 * not have, and the footprint figure it feeds — "planets, not ISK, are what
 * runs out first" — is exactly the number a plan is judged against.
 *
 * Like Command Center Upgrades (see `colonyBudget.ts`), this skill carries no
 * dogma attribute describing its own effect — checked against
 * `dgmTypeAttributes.csv`, where type 2495 has only the four attributes every
 * skill has (primary/secondary attribute, time constant, level). So the
 * `1 + level` rule is hand-maintained here rather than derived from the dump,
 * the same exception `CC_UPGRADE_LEVELS` documents in `scripts/build-sde.mjs`.
 */

import { loadCorrectedSkills } from '@/features/skills/correctedSkills';

/** SDE typeID of Interplanetary Consolidation. */
export const INTERPLANETARY_CONSOLIDATION_SKILL_ID = 2495;

/** The most planets any capsuleer can run, at Interplanetary Consolidation V. */
export const PLANET_SLOTS_MAX = 6;

export interface PlanetSlots {
  slots: number;
  /** True when no skill data was available and untrained was assumed. */
  assumed: boolean;
}

/**
 * @param skillLevel Trained Interplanetary Consolidation, or `null` when the
 *   app has no skill data for this character at all.
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

/**
 * The character's trained Interplanetary Consolidation, or `null` when the app
 * has no skill data for them at all.
 *
 * Read through `loadCorrectedSkills` for the same reason
 * `loadCommandCenterUpgrades` and `loadCustomsCodeExpertise` are: `/skills`
 * lags a finished queue entry until the character next logs in, and a level of
 * this skill is exactly the kind of train that finishes unnoticed — and here
 * it would silently cost the pilot a planet they have already earned.
 */
export async function loadInterplanetaryConsolidation(
  characterId: number,
  nowMs: number
): Promise<number | null> {
  const corrected = await loadCorrectedSkills(characterId, nowMs, {
    skipQueueWithoutScope: true,
  });
  if (!corrected.skillsResult) return null;
  return corrected.trained.get(INTERPLANETARY_CONSOLIDATION_SKILL_ID)?.level ?? 0;
}
