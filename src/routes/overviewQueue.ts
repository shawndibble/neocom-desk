import type { SkillQueueEntry } from '@/esi/endpoints';
import { isQueuePaused } from '@/features/skills/queueStatus';

/** Entries in `queue_position` order — ESI does not guarantee response order matches queue order. */
export function sortQueueEntries(entries: readonly SkillQueueEntry[]): SkillQueueEntry[] {
  return [...entries].sort((a, b) => a.queue_position - b.queue_position);
}

/**
 * Picks the skill queue entry training *right now* (BUG #10): the row whose
 * [start_date, finish_date) window spans `nowMs`, falling back to the
 * earliest not-yet-started entry if none currently spans it. Takes
 * already-`sortQueueEntries`-ordered input.
 */
export function selectActiveEntryFromSorted(
  ordered: readonly SkillQueueEntry[],
  nowMs: number
): SkillQueueEntry | null {
  const spanningNow = ordered.find((e) => {
    if (!e.start_date || !e.finish_date) return false;
    const start = Date.parse(e.start_date);
    const finish = Date.parse(e.finish_date);
    return start <= nowMs && nowMs < finish;
  });
  if (spanningNow) return spanningNow;
  const firstFuture = ordered.find((e) => e.finish_date && Date.parse(e.finish_date) > nowMs);
  return firstFuture ?? null;
}

export interface QueueDepth {
  /** "empty": no entries at all. "paused": entries exist but none carry start/finish dates (not training). "training": at least one entry has dates. */
  status: 'empty' | 'paused' | 'training';
  count: number;
  /** Seconds from `nowMs` to `finalFinishDate`, clamped to 0. 0 when paused/empty. */
  totalRemainingSeconds: number;
  /** The last (by queue_position) entry's finish_date, or null when paused/empty. */
  finalFinishDate: string | null;
}

/** Queue depth for the Overview landing page: count, time to the tail entry, and its finish date. Takes already-`sortQueueEntries`-ordered input. */
export function selectQueueDepth(sorted: readonly SkillQueueEntry[], nowMs: number): QueueDepth {
  if (sorted.length === 0) {
    return { status: 'empty', count: 0, totalRemainingSeconds: 0, finalFinishDate: null };
  }
  if (isQueuePaused(sorted)) {
    return {
      status: 'paused',
      count: sorted.length,
      totalRemainingSeconds: 0,
      finalFinishDate: null,
    };
  }
  const withFinish = sorted.filter((e) => e.finish_date);
  const finalFinishDate = withFinish[withFinish.length - 1].finish_date as string;
  const totalRemainingSeconds = Math.max(0, (Date.parse(finalFinishDate) - nowMs) / 1000);
  return { status: 'training', count: sorted.length, totalRemainingSeconds, finalFinishDate };
}
