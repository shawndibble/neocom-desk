import type { EngineSkill, PlanStep } from '@/engine/types';

export function exceedsAlphaCap(skill: Pick<EngineSkill, 'alphaMaxLevel'>, level: number): boolean {
  return level > (skill.alphaMaxLevel ?? 0);
}

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
