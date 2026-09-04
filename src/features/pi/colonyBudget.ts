/**
 * The CPU/Powergrid a colony has to spend, and where that number came from.
 *
 * `engine/pi/pinBudget.ts` takes a budget as a parameter and never derives
 * one, for the same reason `chain.ts` never derives a customs rate. This is
 * the feature-layer half: it turns "what has this character trained" into the
 * row of `PiData.infrastructure.commandCenterUpgrades` a planet is sized
 * against.
 *
 * `assumed` is the point of the return shape. A character who has never
 * trained Command Center Upgrades and a character whose `/skills` has never
 * loaded both get the level-0 budget, and only the first may be shown as
 * measured — the same "never a confident wrong number" rule the colony
 * `unknown` state and `customsRateSource` follow.
 */

import { loadCorrectedSkills } from '@/features/skills/correctedSkills';
import type { PinLoad } from '@/engine/pi/types';
import type { PiData } from '@/sde/types';

/** SDE typeID of Command Center Upgrades. */
export const COMMAND_CENTER_UPGRADES_SKILL_ID = 2505;

export interface ColonyBudget {
  /** The level the budget was read at, clamped into the table. */
  level: number;
  /** True when no skill data was available and untrained was assumed. */
  assumed: boolean;
  budget: PinLoad;
}

export function colonyBudget(level: number | null, pi: PiData): ColonyBudget {
  const table = pi.infrastructure.commandCenterUpgrades;
  const maxLevel = table.length - 1;
  const clamped =
    level == null ? 0 : Math.min(Math.max(Math.trunc(level), 0), Math.max(maxLevel, 0));
  const row = table[clamped] ?? table[0];
  return {
    level: clamped,
    assumed: level == null,
    budget: { cpu: row.cpu, powergrid: row.powergrid },
  };
}

/**
 * The character's trained Command Center Upgrades, or `null` when the app has
 * no skill data for them at all.
 *
 * Read through `loadCorrectedSkills` for the same reason
 * `loadCustomsCodeExpertise` does: `/skills` lags a finished queue entry
 * until the character next logs in, and a level of this skill is exactly the
 * kind of cheap train that finishes unnoticed — and unlike the customs rate,
 * a stale level here changes every pin count on the page.
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
