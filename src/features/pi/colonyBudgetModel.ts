/**
 * The pure half of `colonyBudget.ts`: which Command Center upgrade row a colony is sized against.
 * Kept free of the skills loader so the advice worker can import it.
 */
import type { PinLoad } from '@/engine/pi/types';
import type { PiData } from '@/sde/types';

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
