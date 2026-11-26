import { DAY_MS } from '@/lib/age';
import type { CharacterSkill, SkillQueueEntry } from '@/esi/endpoints';
import type { PlanEntry, TrainedSkill } from '@/engine/types';

export type SkillQueueStatus = 'completed' | 'training' | 'pending' | 'paused';

export interface ClassifiedQueueEntry {
  entry: SkillQueueEntry;
  status: SkillQueueStatus;
  secondsRemaining: number | null;
}

function finishMs(entry: SkillQueueEntry): number | null {
  if (!entry.finish_date) return null;
  const ms = Date.parse(entry.finish_date);
  return Number.isFinite(ms) ? ms : null;
}

export function isQueuePaused(entries: readonly SkillQueueEntry[]): boolean {
  return entries.length > 0 && entries.every((e) => finishMs(e) === null);
}

export function classifySkillQueue(
  entries: readonly SkillQueueEntry[],
  nowMs: number
): ClassifiedQueueEntry[] {
  const ordered = [...entries].sort((a, b) => a.queue_position - b.queue_position);
  let trainingSeen = false;

  return ordered.map((entry) => {
    const finish = finishMs(entry);
    if (finish === null) return { entry, status: 'paused', secondsRemaining: null };
    if (finish <= nowMs) return { entry, status: 'completed', secondsRemaining: null };

    const status: SkillQueueStatus = trainingSeen ? 'pending' : 'training';
    trainingSeen = true;
    return { entry, status, secondsRemaining: (finish - nowMs) / 1000 };
  });
}

export function queuedLevelsBySkill(
  entries: readonly SkillQueueEntry[],
  nowMs: number
): Map<number, number> {
  const levels = new Map<number, number>();
  for (const { entry, status } of classifySkillQueue(entries, nowMs)) {
    if (status === 'completed') continue;
    levels.set(entry.skill_id, Math.max(levels.get(entry.skill_id) ?? 0, entry.finished_level));
  }
  return levels;
}

export interface CompletedLevel {
  level: number;
  sp: number | null;
}

export function completedQueueLevels(
  entries: readonly SkillQueueEntry[],
  nowMs: number
): Map<number, CompletedLevel> {
  const levels = new Map<number, CompletedLevel>();
  for (const row of classifySkillQueue(entries, nowMs)) {
    if (row.status !== 'completed') continue;
    const { skill_id, finished_level, level_end_sp } = row.entry;
    if (!Number.isInteger(finished_level) || finished_level < 1 || finished_level > 5) continue;
    const known = levels.get(skill_id);
    if (known && known.level >= finished_level) continue;
    const sp =
      level_end_sp !== undefined && Number.isFinite(level_end_sp) && level_end_sp >= 0
        ? level_end_sp
        : null;
    levels.set(skill_id, { level: finished_level, sp });
  }
  return levels;
}

export function applyCompletedQueueEntries(
  trained: ReadonlyMap<number, TrainedSkill>,
  entries: readonly SkillQueueEntry[],
  nowMs: number
): Map<number, TrainedSkill> {
  const merged = new Map(trained);
  for (const [skillId, done] of completedQueueLevels(entries, nowMs)) {
    const known = merged.get(skillId);
    if (known && known.level >= done.level) continue;
    merged.set(skillId, { level: done.level, sp: done.sp ?? known?.sp ?? 0 });
  }
  return merged;
}

function finiteSpOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

function trainingProgressSp(
  entries: readonly SkillQueueEntry[],
  nowMs: number
): { skillId: number; sp: number } | null {
  const rows = classifySkillQueue(entries, nowMs);
  const head = rows[0]?.status === 'paused' ? rows[0] : undefined;
  const row = rows.find((r) => r.status === 'training') ?? head;
  if (!row) return null;

  const { skill_id, start_date, finish_date, training_start_sp, level_end_sp } = row.entry;
  const startSp = finiteSpOrNull(training_start_sp);
  if (startSp === null) return null;
  const endSp = finiteSpOrNull(level_end_sp);

  const startMs = start_date ? Date.parse(start_date) : NaN;
  const finishMs = finish_date ? Date.parse(finish_date) : NaN;
  const window = finishMs - startMs;
  if (endSp === null || endSp <= startSp || !Number.isFinite(window) || window <= 0) {
    return { skillId: skill_id, sp: startSp };
  }

  const fraction = Math.min(Math.max((nowMs - startMs) / window, 0), 1);
  return { skillId: skill_id, sp: Math.floor(startSp + (endSp - startSp) * fraction) };
}

export function applyTrainingProgress(
  trained: ReadonlyMap<number, TrainedSkill>,
  entries: readonly SkillQueueEntry[],
  nowMs: number
): Map<number, TrainedSkill> {
  const merged = new Map(trained);
  const progress = trainingProgressSp(entries, nowMs);
  if (progress === null) return merged;
  const known = merged.get(progress.skillId);
  if (known && known.sp >= progress.sp) return merged;
  merged.set(progress.skillId, { level: known?.level ?? 0, sp: progress.sp });
  return merged;
}

export type QueueState = 'training' | 'idle' | 'paused' | 'endingSoon' | 'unknown';

export const ENDING_SOON_MS = DAY_MS;

export function deriveQueueState(
  entries: readonly SkillQueueEntry[] | undefined,
  nowMs: number
): QueueState {
  if (entries === undefined) return 'unknown';
  if (entries.length === 0) return 'idle';
  if (isQueuePaused(entries)) return 'paused';

  const classified = classifySkillQueue(entries, nowMs);
  const tail = classified[classified.length - 1];
  if (tail.secondsRemaining === null) return 'idle';

  return tail.secondsRemaining * 1000 <= ENDING_SOON_MS ? 'endingSoon' : 'training';
}

export function completedSpGain(
  skills: readonly CharacterSkill[],
  completed: ReadonlyMap<number, CompletedLevel>
): number {
  if (completed.size === 0) return 0;
  const knownSp = new Map(skills.map((skill) => [skill.skill_id, skill.skillpoints_in_skill]));
  let gain = 0;
  for (const [skillId, done] of completed) {
    if (done.sp === null) continue;
    gain += Math.max(0, done.sp - (knownSp.get(skillId) ?? 0));
  }
  return gain;
}

export interface QueueEndProjection {
  startMs: number;
  trained: Map<number, TrainedSkill>;
  queuedLevels: SkillQueueEntry[];
  paused: boolean;
}

export function projectQueueEnd(
  trained: ReadonlyMap<number, TrainedSkill>,
  entries: readonly SkillQueueEntry[],
  nowMs: number,
  planEntries: readonly PlanEntry[]
): QueueEndProjection {
  const paused = isQueuePaused(entries);
  const planned = new Map<number, number>();
  for (const p of planEntries) {
    planned.set(p.skillTypeID, Math.max(planned.get(p.skillTypeID) ?? 0, p.targetLevel));
  }
  const pending = classifySkillQueue(entries, nowMs)
    .filter((row) => row.secondsRemaining !== null)
    .map((row) => row.entry);
  const searchStart = pending.length > 0 ? 1 : 0;
  const dedupOffset = pending
    .slice(searchStart)
    .findIndex((e) => (planned.get(e.skill_id) ?? 0) >= e.finished_level);
  const firstPlanned = dedupOffset === -1 ? -1 : dedupOffset + searchStart;
  const queued = firstPlanned === -1 ? pending : pending.slice(0, firstPlanned);
  const startMs = queued.reduce((max, e) => Math.max(max, finishMs(e) ?? max), nowMs);
  return {
    startMs,
    trained: applyCompletedQueueEntries(trained, queued, startMs),
    queuedLevels: queued,
    paused,
  };
}
