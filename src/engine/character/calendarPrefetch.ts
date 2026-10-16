import { parseInstant } from '../esiInstant';

/** An event that began this recently is still on the board (see `calendarRetention`), so its details are still worth having. */
const RUNNING_GRACE_MS = 3 * 60 * 60_000;

/**
 * Which calendar events to fetch full details for ahead of being opened, so
 * the detail modal works offline: events starting from just now out to the
 * horizon, soonest first, cut to `limit` and then minus those already cached.
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
    if (startMs < options.nowMs - RUNNING_GRACE_MS) continue;
    if (startMs > options.nowMs + options.horizonMs) continue;
    upcoming.push({ id: event.event_id, startMs });
  }
  upcoming.sort((a, b) => a.startMs - b.startMs);
  return upcoming
    .slice(0, Math.max(0, options.limit))
    .map((entry) => entry.id)
    .filter((id) => !options.cachedIds.has(id));
}
