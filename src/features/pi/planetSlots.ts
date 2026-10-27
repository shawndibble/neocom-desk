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

export { PLANET_SLOTS_MAX, planetSlots, type PlanetSlots } from './planetSlotsModel';

/**
 * The character's effective Interplanetary Consolidation (issue #1236: min
 * of queue-corrected trained and active), or `null` when the app has no
 * skill data for them at all.
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
  return corrected.effective.get(INTERPLANETARY_CONSOLIDATION_SKILL_ID) ?? 0;
}
