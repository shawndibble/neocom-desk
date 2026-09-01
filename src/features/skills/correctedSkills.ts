/**
 * The one place that corrects /skills' staleness with completed-but-unapplied
 * queue entries (issue #40). Every route that needs trained levels or a
 * correct total SP reads through here instead of re-deriving the merge
 * itself against its own `Date.now()`.
 *
 * The cache layer can't express this: `esiCache` rows are one key with one
 * fetcher, and the merge is time-dependent, so writing the merged result
 * back would overwrite the true `/skills` payload with a stale snapshot.
 */
import type { CharacterSkills, SkillQueueEntry } from '@/esi/endpoints';
import type { TrainedSkill } from '@/engine/types';
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import type { StatusResult } from '@/esi/cache';
import {
  loadCharacterSkillsWithStatus,
  loadCharacterSkillQueueWithStatus,
  type CachedResult,
} from './data';
import { toTrainedSkillsMap } from './skillMap';
import { applyCompletedQueueEntries, completedQueueLevels, completedSpGain } from './queueStatus';
import type { CompletedLevel } from './queueStatus';

const QUEUE_SCOPE = ESI_REGISTRY.getCharacterSkillQueue.scope;

/** Whether the character's stored token grants the /skillqueue scope. No token row means no grant. */
async function hasQueueScope(characterId: number): Promise<boolean> {
  const token = await db.tokens.get(characterId);
  return (token?.scopes ?? []).includes(QUEUE_SCOPE);
}

export interface CorrectedSkills {
  /** Raw /skills payload + cache metadata. `.data.total_sp` is *not* corrected — use `totalSp`. */
  skillsResult: CachedResult<CharacterSkills> | null;
  /** 401/403 (or a failed token refresh) on /skills: "log in again", not "offline". */
  skillsNeedsReauth: boolean;
  /** Raw skill-queue payload + cache metadata. */
  queueResult: CachedResult<SkillQueueEntry[]> | null;
  /** 401/403 on /skillqueue. */
  queueNeedsReauth: boolean;
  /**
   * The provenance: skill_ids the queue has finished but /skills has not
   * caught up to yet, keyed by skill_id. A skill present here that /skills
   * also lists means "the queue won"; one absent from /skills entirely means
   * /skills omits it.
   */
  completedLevels: Map<number, CompletedLevel>;
  /** Trained skills, corrected by `completedLevels`, ready for engine input. */
  trained: Map<number, TrainedSkill>;
  /** SP the completed levels add on top of ESI's stale total_sp. */
  completedSp: number;
  /** total_sp corrected for the completed queue; null until /skills has loaded. */
  totalSp: number | null;
  /** Older of the two sources' fetchedAt — the true freshness of the corrected picture. */
  fetchedAt: Date | null;
}

function olderOf(a: Date | undefined, b: Date | undefined): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}

export interface LoadCorrectedSkillsOptions {
  /**
   * Skip the /skillqueue read entirely when the active character has not
   * granted its scope, rather than attempting it and letting the guaranteed
   * 401 raise the shell-wide re-auth notice. Only for callers that use
   * `trained`/`totalSp` and don't otherwise show queue data (Skills,
   * Industry) — a page that displays the queue itself still needs the
   * attempt, and its own re-auth prompt, to explain a missing grant.
   */
  skipQueueWithoutScope?: boolean;
}

/** Corrected skills for one character. `nowMs` is a parameter, keeping this clock-free. */
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
  const trained = applyCompletedQueueEntries(toTrainedSkillsMap(rawSkills), queueEntries, nowMs);
  const completedSp = completedSpGain(rawSkills, completedLevels);
  const totalSp = skillsResult?.data ? skillsResult.data.total_sp + completedSp : null;

  return {
    skillsResult,
    skillsNeedsReauth,
    queueResult,
    queueNeedsReauth,
    completedLevels,
    trained,
    completedSp,
    totalSp,
    fetchedAt: olderOf(skillsResult?.fetchedAt, queueResult?.fetchedAt),
  };
}
