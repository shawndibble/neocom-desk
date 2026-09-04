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
import type { PinLoad } from '@/engine/pi/types';
import type { PiData } from '@/sde/types';

/** SDE typeID of Command Center Upgrades. */
export const COMMAND_CENTER_UPGRADES_SKILL_ID = 2505;

function budgetAt(level: number, pi: PiData): { level: number; budget: PinLoad } {
  const table = pi.infrastructure.commandCenterUpgrades;
  const maxLevel = Math.max(table.length - 1, 0);
  const clamped = Math.min(Math.max(Math.trunc(level), 0), maxLevel);
  const row = table[clamped] ?? table[0];
  return { level: clamped, budget: { cpu: row.cpu, powergrid: row.powergrid } };
}

/**
 * What this colony's Command Center supplies right now, from the colony's own
 * `upgrade_level`. Measured, so there is nothing to flag.
 */
export function colonyBudget(upgradeLevel: number, pi: PiData): { level: number; budget: PinLoad } {
  return budgetAt(upgradeLevel, pi);
}

export interface MaxColonyBudget {
  /** The highest upgrade level the pilot's skill allows. */
  level: number;
  /** True when no skill data was available and untrained was assumed. */
  assumed: boolean;
  budget: PinLoad;
}

/**
 * The most any colony of this character's could supply, capped by their
 * Command Center Upgrades skill. For an unbuilt planet, which has no Command
 * Center to read.
 *
 * `assumed` keeps a character who has never trained the skill distinct from
 * one whose `/skills` has never loaded. Both get the level-0 budget and only
 * the first may be shown as fact — the same distinction `customsRateSource`
 * draws for the customs rate and the colony `unknown` state draws for health.
 */
export function maxColonyBudget(skillLevel: number | null, pi: PiData): MaxColonyBudget {
  return { ...budgetAt(skillLevel ?? 0, pi), assumed: skillLevel == null };
}

/**
 * The character's trained Command Center Upgrades, or `null` when the app has
 * no skill data for them at all.
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
  return corrected.trained.get(COMMAND_CENTER_UPGRADES_SKILL_ID)?.level ?? 0;
}
