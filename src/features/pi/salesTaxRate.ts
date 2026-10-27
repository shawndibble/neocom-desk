/**
 * The sales tax rate a colony's output is priced net of, and where the
 * Accounting level behind it comes from.
 *
 * `engine/pi/chain.ts`, `colonyEarnings.ts`, `stopTier.ts` and `network.ts`
 * all take `salesTaxPct` as a parameter and never derive it — see
 * `engine/industry/fees.ts#salesTaxPct` for the Accounting-level formula
 * itself, which this module is the PI-side caller of. Mirrors
 * `customsRate.ts#loadCustomsCodeExpertise`: a single character-wide skill,
 * loaded once per Advisor snapshot.
 */

import { SKILL_IDS } from '@/engine/industry/types';
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';

/**
 * The character's trained Accounting level, or `null` when the app has no
 * skill data for them at all.
 *
 * `null` and `0` are deliberately different: a character who has never
 * trained Accounting is a confident 0 (the maximum 7.5% rate), while a
 * character whose `/skills` has never loaded is unknown. Both price at the
 * same 7.5%, since untrained is the correct reading either way, but the two
 * cases are kept apart the way `loadCustomsCodeExpertise` keeps its own.
 */
export async function loadAccountingLevel(
  characterId: number,
  nowMs: number
): Promise<number | null> {
  const corrected = await loadCorrectedSkills(characterId, nowMs, {
    skipQueueWithoutScope: true,
  });
  if (!corrected.skillsResult) return null;
  return corrected.trained.get(SKILL_IDS.accounting)?.level ?? 0;
}
