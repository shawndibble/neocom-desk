import type { SkillQueueEntry } from '@/esi/endpoints';

/**
 * Picks the skill queue entry the character is training *right now* (BUG
 * #10): the row whose [start_date, finish_date) window spans `nowMs`, falling
 * back to the earliest not-yet-started entry if none currently spans it
 * (queue not yet picked up by the server, or a gap between entries). Entries
 * are read in `queue_position` order — ESI does not guarantee response
 * order matches queue order. Paused-queue entries (no start/finish date) are
 * skipped; they can never be "the one training now."
 */
export function selectActiveQueueEntry(
  entries: readonly SkillQueueEntry[],
  nowMs: number
): SkillQueueEntry | null {
  const ordered = [...entries].sort((a, b) => a.queue_position - b.queue_position);
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
