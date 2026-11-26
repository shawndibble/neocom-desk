import type { SkillQueueEntry } from '@/esi/endpoints';

export function sortQueueEntries(entries: readonly SkillQueueEntry[]): SkillQueueEntry[] {
  return [...entries].sort((a, b) => a.queue_position - b.queue_position);
}

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
