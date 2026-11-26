import { DAY_MS } from '@/lib/age';

export const RETENTION_MS = 14 * DAY_MS;

export function retentionEndsAt(startMs: number): number {
  return startMs + RETENTION_MS;
}

export interface CalendarRetentionEntry {
  id: number;
  startMs: number;
}

export function stillRunning(
  previous: readonly CalendarRetentionEntry[],
  fresh: readonly CalendarRetentionEntry[],
  nowMs: number
): number[] {
  const freshIds = new Set(fresh.map((event) => event.id));
  const retained: number[] = [];
  const seen = new Set<number>();
  for (const event of previous) {
    if (freshIds.has(event.id) || seen.has(event.id)) continue;
    if (event.startMs > nowMs) continue;
    if (nowMs >= retentionEndsAt(event.startMs)) continue;
    seen.add(event.id);
    retained.push(event.id);
  }
  return retained;
}
