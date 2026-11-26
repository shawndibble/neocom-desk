import type { PinLoad } from '@/engine/pi/types';
import type { PiData } from '@/sde/types';

function budgetAt(level: number, pi: PiData): { level: number; budget: PinLoad } {
  const table = pi.infrastructure.commandCenterUpgrades;
  const maxLevel = Math.max(table.length - 1, 0);
  const clamped = Math.min(Math.max(Math.trunc(level), 0), maxLevel);
  const row = table[clamped] ?? table[0];
  return { level: clamped, budget: { cpu: row.cpu, powergrid: row.powergrid } };
}

export function colonyBudget(upgradeLevel: number, pi: PiData): { level: number; budget: PinLoad } {
  return budgetAt(upgradeLevel, pi);
}

export interface MaxColonyBudget {
  level: number;
  assumed: boolean;
  budget: PinLoad;
}

export function maxColonyBudget(skillLevel: number | null, pi: PiData): MaxColonyBudget {
  return { ...budgetAt(skillLevel ?? 0, pi), assumed: skillLevel == null };
}
