import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import type { TrainedSkill } from '@/engine/types';
import type { SkillLevels } from '@/engine/industry/types';
import { ESI_REGISTRY } from '@/esi/registry';
import type { StatusResult } from '@/esi/cache';
import {
  loadCharacterSkillsWithStatus,
  loadCharacterSkillQueueWithStatus,
  type CachedResult,
} from './data';
import { toTrainedSkillsMap } from './skillMap';
import { effectiveSkillLevelsFromTrained } from './effectiveSkillLevels';
import {
  applyCompletedQueueEntries,
  applyTrainingProgress,
  completedQueueLevels,
  completedSpGain,
} from '@/engine/skills/queueStatus';
import type { CompletedLevel } from '@/engine/skills/queueStatus';
import { loadGrantedScopes } from '@/app/grantedScopes';

const QUEUE_SCOPE = ESI_REGISTRY.getCharacterSkillQueue.scope;

async function hasQueueScope(characterId: number): Promise<boolean> {
  return (await loadGrantedScopes(characterId)).has(QUEUE_SCOPE);
}

export interface CorrectedSkills {
  skillsResult: CachedResult<CharacterSkills> | null;
  skillsNeedsReauth: boolean;
  queueResult: CachedResult<SkillQueueEntry[]> | null;
  queueNeedsReauth: boolean;
  completedLevels: Map<number, CompletedLevel>;
  trained: Map<number, TrainedSkill>;
  effective: Map<number, number>;
  completedSp: number;
  totalSp: number | null;
  fetchedAt: Date | null;
}

function olderOf(a: Date | undefined, b: Date | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}

export interface LoadCorrectedSkillsOptions {
  skipQueueWithoutScope?: boolean;
}

export async function loadCorrectedSkills(
  characterId: number,
  nowMs: number,
  options: LoadCorrectedSkillsOptions = {}
): Promise<CorrectedSkills> {
  const skillsStatusPromise = loadCharacterSkillsWithStatus(characterId);
  const queueScopeGranted = options.skipQueueWithoutScope ? await hasQueueScope(characterId) : true;
  const queueStatusPromise: Promise<StatusResult<SkillQueueEntry[]>> = queueScopeGranted
    ? loadCharacterSkillQueueWithStatus(characterId)
    : Promise.resolve({ cached: null, needsReauth: false });

  const [skillsStatus, queueStatus] = await Promise.all([skillsStatusPromise, queueStatusPromise]);
  const { cached: skillsResult, needsReauth: skillsNeedsReauth } = skillsStatus;
  const { cached: queueResult, needsReauth: queueNeedsReauth } = queueStatus;

  const queueEntries = queueResult?.data ?? [];
  const rawSkills = skillsResult?.data?.skills ?? [];
  const completedLevels = completedQueueLevels(queueEntries, nowMs);
  const trained = applyTrainingProgress(
    applyCompletedQueueEntries(toTrainedSkillsMap(rawSkills), queueEntries, nowMs),
    queueEntries,
    nowMs
  );
  const effective = effectiveSkillLevelsFromTrained(trained, rawSkills, queueEntries, nowMs);
  const completedSp = completedSpGain(rawSkills, completedLevels);
  const totalSp = skillsResult?.data ? skillsResult.data.total_sp + completedSp : null;

  return {
    skillsResult,
    skillsNeedsReauth,
    queueResult,
    queueNeedsReauth,
    completedLevels,
    trained,
    effective,
    completedSp,
    totalSp,
    fetchedAt: olderOf(skillsResult?.fetchedAt, queueResult?.fetchedAt),
  };
}

export function skillLevelsOf(corrected: CorrectedSkills): SkillLevels {
  const levels: SkillLevels = {};
  for (const [skillId, trained] of corrected.trained) levels[skillId] = trained.level;
  return levels;
}
