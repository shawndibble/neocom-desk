import type { CharacterSkill, SkillQueueEntry } from '@/esi/endpoints';
import type { TrainedSkill } from '@/engine/types';

/**
 * What a row of the in-game queue is doing as of a given instant.
 *
 * `completed` exists because ESI keeps finished entries until the character
 * next logs in — the `/skillqueue` description says so, and `/skills` says
 * these entries "need to be applied on top of this list to get an accurate
 * view". They are the difference between what ESI reports and what the
 * character has actually trained.
 */
export type SkillQueueStatus = 'completed' | 'training' | 'pending' | 'paused';

export interface ClassifiedQueueEntry {
  entry: SkillQueueEntry;
  status: SkillQueueStatus;
  /** Seconds until this level finishes. Null when done, or when unknowable. */
  secondsRemaining: number | null;
}

/**
 * A usable finish instant, or null. Guards NaN explicitly: `Date.parse` of a
 * malformed date yields NaN, and every comparison against NaN is false, so an
 * unguarded check files a broken row under "still training" forever.
 */
function finishMs(entry: SkillQueueEntry): number | null {
  if (!entry.finish_date) return null;
  const ms = Date.parse(entry.finish_date);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * A paused queue omits its date fields entirely. Absent dates mean "paused,
 * ETA unknown" — never "starts now". EVEMon shipped the opposite reading
 * (peterhaneve/evemon#40) and marked skills falsely complete on re-import.
 */
export function isQueuePaused(entries: readonly SkillQueueEntry[]): boolean {
  return entries.length > 0 && entries.every((e) => finishMs(e) === null);
}

/**
 * Order the queue and label each row, given the current instant. `nowMs` is a
 * parameter so this stays pure and testable without a frozen clock.
 */
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

    // The first row still in the future is the one actually training; the
    // rest are queued behind it. ESI dates them all absolutely, so remaining
    // time is real for every row, not an estimate.
    const status: SkillQueueStatus = trainingSeen ? 'pending' : 'training';
    trainingSeen = true;
    return { entry, status, secondsRemaining: (finish - nowMs) / 1000 };
  });
}

/** A level ESI's /skills has not caught up to yet. `sp` is null when absent. */
export interface CompletedLevel {
  level: number;
  sp: number | null;
}

/**
 * The levels the character has actually finished but /skills does not yet
 * report. ESI's own /skills description says these entries "need to be
 * applied on top of this list to get an accurate view".
 *
 * Built on classifySkillQueue so the past-date and paused rules are defined
 * once. A paused queue yields nothing: an absent date is not a past date.
 */
export function completedQueueLevels(
  entries: readonly SkillQueueEntry[],
  nowMs: number
): Map<number, CompletedLevel> {
  const levels = new Map<number, CompletedLevel>();
  for (const row of classifySkillQueue(entries, nowMs)) {
    if (row.status !== 'completed') continue;
    const { skill_id, finished_level, level_end_sp } = row.entry;
    // The entry is a cast over an ESI response, and over whatever Dexie
    // replays for it — nothing here is guaranteed. A level outside 1..5
    // throws in the industry engine and silently empties a plan in
    // normalizePlan, so drop the row rather than pass it on. Dropping falls
    // back to /skills, which is the conservative answer; clamping would
    // invent a level the character may not hold.
    if (!Number.isInteger(finished_level) || finished_level < 1 || finished_level > 5) continue;
    const known = levels.get(skill_id);
    // Max, not last-write-wins: queue order does not guarantee the highest
    // level comes last, and a lower level must never overwrite a higher one.
    if (known && known.level >= finished_level) continue;
    const sp =
      level_end_sp !== undefined && Number.isFinite(level_end_sp) && level_end_sp >= 0
        ? level_end_sp
        : null;
    levels.set(skill_id, { level: finished_level, sp });
  }
  return levels;
}

/**
 * Trained skills as of now, with completed-but-unapplied queue entries folded
 * in.
 *
 * SP only rises when ESI supplies `level_end_sp` — it is optional. The engine
 * schedules from `level` alone, so a raised level beside a stale `sp` costs
 * display precision, not a wrong plan.
 */
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

export type QueueState = 'training' | 'idle' | 'paused' | 'endingSoon' | 'unknown';

/** How close the last queued entry's finish must be to count as "about to run dry". */
const ENDING_SOON_MS = 24 * 60 * 60 * 1000;

/**
 * Cache-only queue-state classification for one character, for roster-wide
 * "who needs my attention" views. Built on `isQueuePaused`/`classifySkillQueue`
 * rather than restating their paused rule: an absent date means paused with an
 * unknown ETA, never "starts now" (peterhaneve/evemon#40).
 */
export function deriveQueueState(
  entries: readonly SkillQueueEntry[] | undefined,
  nowMs: number
): QueueState {
  if (entries === undefined) return 'unknown';
  if (entries.length === 0) return 'idle';
  if (isQueuePaused(entries)) return 'paused';

  // classifySkillQueue orders by queue_position, so the last row is the tail
  // of the queue: the one that determines when the character runs dry.
  const classified = classifySkillQueue(entries, nowMs);
  const tail = classified[classified.length - 1];
  if (tail.secondsRemaining === null) return 'idle';

  return tail.secondsRemaining * 1000 <= ENDING_SOON_MS ? 'endingSoon' : 'training';
}

/**
 * Total SP the credited levels add on top of what `/skills` reports, so a
 * page cannot show a raised per-skill SP beside a total that contradicts it.
 *
 * Only entries carrying `level_end_sp` contribute — the same entries whose
 * per-skill SP rises — so the total stays exactly as precise as the rows it
 * sums, never guessing a figure ESI withheld.
 *
 * Takes the ESI rows rather than a lookup: nothing is built when the queue
 * credits nothing, which is every load between logins.
 */
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
