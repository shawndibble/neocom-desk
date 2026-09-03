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
 * SP only rises when ESI supplies `level_end_sp` — it is optional. A raised
 * level beside a stale `sp` only understates how far into the *next* level
 * the character is, which `applyTrainingProgress` then corrects for the one
 * level actually training; every other level is costed in full either way.
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

/** A usable, non-negative SP figure, or null — ESI's SP fields are all optional. */
function finiteSpOrNull(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * The SP the character holds in the skill it is training *right now*.
 *
 * `/skills`' `skillpoints_in_skill` is the figure as of the last time the
 * game applied SP, so for the one skill actually training it reads low —
 * frozen near where training began. The queue carries what is needed to do
 * better: `training_start_sp`, `level_end_sp`, and the window the level
 * trains across. Interpolating between them is what the in-game queue itself
 * shows, and it is linear because the training rate is constant within a level.
 *
 * Returns null unless there is a row to read. A paused queue has no window to
 * interpolate across, so it yields `training_start_sp` alone — a floor, not
 * an estimate.
 */
function trainingProgressSp(
  entries: readonly SkillQueueEntry[],
  nowMs: number
): { skillId: number; sp: number } | null {
  const rows = classifySkillQueue(entries, nowMs);
  // A paused queue has no 'training' row at all (its dates are absent), so
  // fall back to the head of the queue: that is the level that was training
  // when the queue stopped, and its banked SP is still a lower bound.
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
  // A missing, malformed or zero-length window, or an end SP not above the
  // start, leaves nothing to interpolate across. The banked SP is still true,
  // so report that rather than nothing.
  if (endSp === null || endSp <= startSp || !Number.isFinite(window) || window <= 0) {
    return { skillId: skill_id, sp: startSp };
  }

  // Clamped both ways: a finished row classifies as `completed` rather than
  // `training`, but clock skew can still put `now` outside the window, and
  // extrapolating would claim SP the character does not have.
  const fraction = Math.min(Math.max((nowMs - startMs) / window, 0), 1);
  // Floored, so the credit never exceeds what has actually been earned.
  return { skillId: skill_id, sp: Math.floor(startSp + (endSp - startSp) * fraction) };
}

/**
 * Trained skills with the in-progress level's SP brought up to date.
 *
 * Composes with `applyCompletedQueueEntries` rather than widening it: that
 * pass raises the *levels* the queue has finished, this one raises the *SP*
 * banked inside the level still running. It only ever raises, so a `/skills`
 * read somehow ahead of the queue wins.
 *
 * Without it the planner charges a part-trained level in full, and a plan's
 * first row disagrees with the in-game queue by however much of that level
 * is already paid for — the whole of the "Coherent Ore Processing IV says
 * 2d 2h, the game says 1d 9h" report.
 */
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
  // The level is left exactly as found: a skill training toward IV still
  // *has* level III until its queue entry completes, which is the other
  // pass's business.
  merged.set(progress.skillId, { level: known?.level ?? 0, sp: progress.sp });
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
