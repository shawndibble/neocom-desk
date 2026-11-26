import { romanLevel } from './projection';
import type { EngineSkill, PlanStep } from '@/engine/types';

export function exportPlanToClipboard(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>
): string {
  return steps
    .map((step) => {
      const skill = skills.get(step.skillTypeID);
      if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
      if (!Number.isInteger(step.level) || step.level < 1 || step.level > 5) {
        throw new RangeError(`level must be an integer 1..5, got ${step.level}`);
      }
      return `${skill.name} ${romanLevel(step.level)}`;
    })
    .join('\n');
}
