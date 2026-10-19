/** The skills read behind `customsRate.ts`, split out so the advice worker can import the pure rates without the skills loader. */
import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import { CUSTOMS_CODE_EXPERTISE_SKILL_ID } from './customsRate';

/**
 * The character's effective (issue #1236: min of queue-corrected trained and
 * active) Customs Code Expertise, or `null` when the app has no skill data
 * for them at all.
 *
 * `null` and `0` are deliberately different answers and both are real: a
 * character who has never trained it is a confident 0, while a character whose
 * `/skills` has never loaded is unknown. Both start the rate at 10%, but only
 * the first may say so on screen.
 *
 * Read through `loadCorrectedSkills` rather than `/skills` directly, for the
 * same reason every other planner in the app does: `/skills` lags a finished
 * queue entry until the character next logs in, and this skill is cheap enough
 * to be exactly the kind that finishes unnoticed.
 */
export async function loadCustomsCodeExpertise(
  characterId: number,
  nowMs: number
): Promise<number | null> {
  const corrected = await loadCorrectedSkills(characterId, nowMs, {
    skipQueueWithoutScope: true,
  });
  if (!corrected.skillsResult) return null;
  return corrected.effective.get(CUSTOMS_CODE_EXPERTISE_SKILL_ID) ?? 0;
}
