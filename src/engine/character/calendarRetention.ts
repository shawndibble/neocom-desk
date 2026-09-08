/**
 * Which calendar events survive a fresh ESI read that no longer mentions them.
 *
 * `GET /characters/{id}/calendar` returns the next 50 events **from now**, so
 * an event drops out of the response the moment it starts. The cache replaces
 * its row wholesale, so before this a fleet op that runs for four hours
 * vanished from `/calendar` — and from the Foreground Poller's snapshot —
 * the instant it began. That is exactly when a pilot most wants to see it, and
 * it also starved `diffCalendarEventStarting`: that diff looks for an entry
 * whose `startMs` is newly in the past, in a list ESI had already dropped it
 * from.
 *
 * The rule turns on one discriminator, and only one: **has it started?**
 *
 * - Gone from the fresh read and *already started* — ESI drops started events,
 *   so absence says nothing about whether it still exists. Keep it.
 * - Gone from the fresh read and *still upcoming* — ESI would have returned it,
 *   so absence means it was deleted or the invite was withdrawn in game. Drop
 *   it, or the board shows a cancelled event.
 *
 * Retention ends at local midnight rather than after a fixed span: "some
 * events start and run for several hours" is a statement about a day, and a
 * rolling 24-hour window would carry yesterday evening's op into this morning
 * under a "Today" heading. Local days, not UTC, for `localDay.ts`'s reason —
 * a pilot reading "Today" means their own.
 *
 * Pure (CLAUDE.md): ids and instants in, ids out. Engine-native shapes, so
 * `features/character/calendar.ts` adapts ESI's summaries at the boundary and
 * this module never learns what an `event_date` string looks like.
 */

import { localMidnight } from '../localDay';

/** One previously-seen event, reduced to what the rule actually reads. */
export interface CalendarRetentionEntry {
  id: number;
  /** Epoch ms the event starts. A `NaN` is treated as unknown and never retained. */
  startMs: number;
}

/**
 * The ids in `previous` that a fresh read dropped only because they have
 * already started today — in first-seen order, each at most once.
 *
 * Returns ids rather than entries so the caller keeps ownership of the full
 * ESI summaries it has to hand back; this decides *which*, not *what*.
 */
export function stillRunningToday(
  previous: readonly CalendarRetentionEntry[],
  fresh: readonly CalendarRetentionEntry[],
  nowMs: number
): number[] {
  const freshIds = new Set(fresh.map((event) => event.id));
  const today = localMidnight(nowMs);
  const retained: number[] = [];
  const seen = new Set<number>();
  for (const event of previous) {
    if (freshIds.has(event.id) || seen.has(event.id)) continue;
    if (!Number.isFinite(event.startMs)) continue;
    if (event.startMs > nowMs) continue;
    if (localMidnight(event.startMs) !== today) continue;
    seen.add(event.id);
    retained.push(event.id);
  }
  return retained;
}
