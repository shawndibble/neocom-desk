import type { EngineSkill, PlanStep } from '@/engine/types';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'] as const;

/**
 * Serialize a plan to EVE's in-game "import skill plan from clipboard" format:
 * one line per step, "<Skill Name> <Roman level>".
 */
export function exportPlanToClipboard(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
): string {
  return steps
    .map((step) => {
      const skill = skills.get(step.skillTypeID);
      if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
      if (!Number.isInteger(step.level) || step.level < 1 || step.level > 5) {
        throw new RangeError(`level must be an integer 1..5, got ${step.level}`);
      }
      return `${skill.name} ${ROMAN[step.level - 1]}`;
    })
    .join('\n');
}
