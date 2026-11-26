import type { CharacterSkill, SkillQueueEntry } from '@/esi/endpoints';
import type { TrainedSkill } from '@/engine/types';
import { effectiveSkillLevel } from '@/engine/effectiveSkillLevel';
import { toTrainedSkillsMap } from './skillMap';
import { applyCompletedQueueEntries } from '@/engine/skills/queueStatus';

export function effectiveSkillLevelsFromTrained(
  trained: ReadonlyMap<number, Pick<TrainedSkill, 'level'>>,
  rawSkills: readonly CharacterSkill[],
  queueEntries: readonly SkillQueueEntry[],
  nowMs: number
): Map<number, number> {
  const activeLevels = new Map<number, TrainedSkill>(
    rawSkills.map((skill) => [skill.skill_id, { level: skill.active_skill_level, sp: 0 }])
  );
  const active = applyCompletedQueueEntries(activeLevels, queueEntries, nowMs);
  const result = new Map<number, number>();
  for (const skillId of new Set([...trained.keys(), ...active.keys()])) {
    result.set(
      skillId,
      effectiveSkillLevel(trained.get(skillId)?.level ?? 0, active.get(skillId)?.level ?? 0)
    );
  }
  return result;
}

export function effectiveSkillLevels(
  rawSkills: readonly CharacterSkill[],
  queueEntries: readonly SkillQueueEntry[],
  nowMs: number
): Map<number, number> {
  const trained = applyCompletedQueueEntries(toTrainedSkillsMap(rawSkills), queueEntries, nowMs);
  return effectiveSkillLevelsFromTrained(trained, rawSkills, queueEntries, nowMs);
}
