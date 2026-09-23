/**
 * Per-skill effective level (issue #1236: min of queue-corrected trained and
 * active) computed directly from raw ESI rows, for callers that already hold
 * `/skills` + `/skillqueue` in hand and don't need `loadCorrectedSkills`'
 * full `CorrectedSkills` shape (SP interpolation, reauth flags, fetch
 * status...) — e.g. a roster snapshot that already fetched both for other
 * reasons.
 */
import type { CharacterSkill, SkillQueueEntry } from '@/esi/endpoints';
import type { TrainedSkill } from '@/engine/types';
import { effectiveSkillLevel } from '@/engine/effectiveSkillLevel';
import { toTrainedSkillsMap } from './skillMap';
import { applyCompletedQueueEntries } from './queueStatus';

/**
 * Same as {@link effectiveSkillLevels}, but for a caller that has already
 * built the queue-corrected trained map (`loadCorrectedSkills` does, for its
 * own `trained` field) and would otherwise redo that pass a second time.
 */
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
