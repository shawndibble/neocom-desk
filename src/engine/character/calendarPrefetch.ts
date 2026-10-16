import { parseInstant } from '../esiInstant';
import { retentionEndsAt } from './calendarRetention';

/**
 * Which calendar events to fetch full details for ahead of being opened, so
 * the detail modal works offline: events starting out to the horizon, plus
 * those that began recently enough to still be on the board (the same
 * `retentionEndsAt` rule the calendar uses), soonest first, cut to `limit` and
 * then minus those already cached.
 * The cut comes first so each sync adds only what newly entered the window.
 * An event whose date will not parse is left out rather than guessed at.
 */
export function selectCalendarEventsToPrefetch(
  events: ReadonlyArray<{ event_id: number; event_date: string }>,
  options: { nowMs: number; horizonMs: number; cachedIds: ReadonlySet<number>; limit: number }
): number[] {
  const upcoming: Array<{ id: number; startMs: number }> = [];
  for (const event of events) {
    const startMs = parseInstant(event.event_date);
    if (startMs === null) continue;
    // Started already: still on the board only while the calendar retains it.
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
