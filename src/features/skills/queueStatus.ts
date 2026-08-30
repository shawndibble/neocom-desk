import type { SkillQueueEntry } from '@/esi/endpoints';

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
