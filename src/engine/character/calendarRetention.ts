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
 * Retention ends at the end of the event's own local day, **or six hours after
 * it started, whichever is later.**
 *
 * The day alone was the first rule and it was wrong at exactly one hour of the
 * clock: a 22:00 op is still going at 01:00, and midnight is not evidence that
 * it ended. The six hours are a stand-in for a duration the calendar summary
 * does not carry — `GET /calendar/{event_id}` does return `duration`, but
 * fetching it for fifty events on every poll is a lot of traffic to buy a
 * sharper edge on a handful of late ops.
 *
 * Long enough for the ops people actually run late; short enough that nobody
 * opens the app in the morning to last night's calendar. It deliberately does
 * **not** become a look-back window: this device only ever retains what it saw
 * before the event started, so a longer tail would show a partial yesterday
 * that reads as a complete one — worse than showing none, because nothing on
 * screen says which it is.
 *
 * Local days, not UTC, for `localDay.ts`'s reason — a pilot reading "Today"
 * means their own.
 *
 * Pure (CLAUDE.md): ids and instants in, ids out. Engine-native shapes, so
 * `features/character/calendar.ts` adapts ESI's summaries at the boundary and
 * this module never learns what an `event_date` string looks like.
 */

import { localMidnight, nextLocalDay } from '../localDay';

/**
 * How long an event is assumed to run when nothing says otherwise. Only ever
 * *extends* retention past the end of its day — see the module comment.
 */
export const ASSUMED_RUN_MS = 6 * 60 * 60 * 1000;

/** The instant an event stops being worth showing: end of its day, or its assumed run, whichever is later. */
export function retentionEndsAt(startMs: number): number {
  return Math.max(nextLocalDay(localMidnight(startMs)), startMs + ASSUMED_RUN_MS);
}

/** One previously-seen event, reduced to what the rule actually reads. */
export interface CalendarRetentionEntry {
  id: number;
  /**
   * Epoch ms the event starts. Already parsed by the caller; a `NaN` must
   * never reach here — `features/character/calendar.ts` drops an event whose
   * `event_date` will not parse, the same contract `board.ts`'s `deadlineMs`
   * states for the same reason.
   */
  startMs: number;
}

/**
 * The ids in `previous` that a fresh read dropped only because they have
 * already started and are still assumed to be running — in first-seen order,
 * each at most once.
 *
 * Returns ids rather than entries so the caller keeps ownership of the full
 * ESI summaries it has to hand back; this decides *which*, not *what*.
 */
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
