import type { EngineSkill, PlanStep } from '@/engine/types';

/** True when an Alpha clone cannot train `skill` to `level`. */
export function exceedsAlphaCap(skill: Pick<EngineSkill, 'alphaMaxLevel'>, level: number): boolean {
  return level > (skill.alphaMaxLevel ?? 0);
}

/** Indices of the steps an Alpha clone cannot train. Unknown skills are skipped, not flagged. */
export function alphaCappedStepIndices(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>
): Set<number> {
  const capped = new Set<number>();
  steps.forEach((step, index) => {
    const skill = skills.get(step.skillTypeID);
    if (skill && exceedsAlphaCap(skill, step.level)) capped.add(index);
  });
  return capped;
}
