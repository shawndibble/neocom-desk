/**
 * The CPU/Powergrid a colony has to spend.
 *
 * `engine/pi/pinBudget.ts` takes a budget as a parameter and never derives
 * one, for the same reason `chain.ts` never derives a customs rate. This is
 * the feature-layer half: it picks the row of
 * `PiData.infrastructure.commandCenterUpgrades` a planet is sized against.
 *
 * ## Two different questions, two functions
 *
 * A colony's budget comes from **its own Command Center's upgrade level** —
 * `CharacterPlanet.upgrade_level`, which ESI reports per colony. The pilot's
 * Command Center Upgrades skill is only the *ceiling*: it caps how far any
 * colony may be upgraded, and each level is then bought per colony with ISK
 * (which is why the wiki table the numbers come from prices every row).
 *
 * Reading the budget off the skill instead would assume every colony is
 * upgraded to the pilot's maximum, and so **overstate** the headroom of every
 * colony that is not — the one direction the Advisor must not err in, since
 * the whole point of the meter is to say what will actually fit. So
 * `colonyBudget` takes a real colony's own level and needs no hedge, and
 * `maxColonyBudget` answers the separate "how far could a colony here go"
 * question, where the skill is the right input and `null` is a real state.
 *
 * ESI documents no description for `upgrade_level`, so that reading is an
 * inference — but a well-supported one: the field is per-colony rather than
 * per-character, the source table prices each level in ISK, and each level
 * used to be a separate deployable item (see
 * `docs/research/pi-cpu-power-mechanics.md` §1-2). It is also the
 * conservative reading, which is the tie-breaker.
 */

import { loadCorrectedSkills } from '@/features/skills/correctedSkills';

/** SDE typeID of Command Center Upgrades. */
export const COMMAND_CENTER_UPGRADES_SKILL_ID = 2505;

export { colonyBudget, maxColonyBudget, type MaxColonyBudget } from './colonyBudgetModel';

/**
 * The character's effective (issue #1236: min of queue-corrected trained and
 * active) Command Center Upgrades, or `null` when the app has no skill data
 * for them at all.
 *
 * Read through `loadCorrectedSkills` for the same reason
 * `loadCustomsCodeExpertise` does: `/skills` lags a finished queue entry
 * until the character next logs in, and a level of this skill is exactly the
 * kind of cheap train that finishes unnoticed.
 */
export async function loadCommandCenterUpgrades(
  characterId: number,
  nowMs: number
): Promise<number | null> {
  const corrected = await loadCorrectedSkills(characterId, nowMs, {
    skipQueueWithoutScope: true,
  });
  if (!corrected.skillsResult) return null;
  return corrected.effective.get(COMMAND_CENTER_UPGRADES_SKILL_ID) ?? 0;
}
