import { parseInstant } from '../esiInstant';
import { retentionEndsAt } from './calendarRetention';

export function selectCalendarEventsToPrefetch(
  events: ReadonlyArray<{ event_id: number; event_date: string }>,
  options: { nowMs: number; horizonMs: number; cachedIds: ReadonlySet<number>; limit: number }
): number[] {
  const upcoming: Array<{ id: number; startMs: number }> = [];
  for (const event of events) {
    const startMs = parseInstant(event.event_date);
    if (startMs === null) continue;
    if (startMs < options.nowMs && retentionEndsAt(startMs) <= options.nowMs) continue;
    if (startMs > options.nowMs + options.horizonMs) continue;
    upcoming.push({ id: event.event_id, startMs });
  }
  upcoming.sort((a, b) => a.startMs - b.startMs);
  return upcoming
    .slice(0, Math.max(0, options.limit))
    .map((entry) => entry.id)
    .filter((id) => !options.cachedIds.has(id));
}
