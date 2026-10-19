import type { SkillQueueEntry } from '@/esi/endpoints';

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
