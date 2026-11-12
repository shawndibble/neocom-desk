/**
 * Which calendar events survive a fresh ESI read that no longer mentions them.
 *
 * `GET /characters/{id}/calendar` returns the next 50 events **from now**, so
 * an event drops out of the response the moment it starts. The cache replaces
 * its row wholesale, so without this a fleet op vanished from `/calendar` — and
 * from the Foreground Poller's snapshot — the instant it began, and
 * `diffCalendarEventStarting` (which looks for an entry whose `startMs` is newly
 * in the past) never saw it.
 *
 * The rule turns on one discriminator: **has it started?**
 *
 * - Gone from the fresh read and *already started* — ESI drops started events,
 *   so absence says nothing about whether it still exists. Keep it.
 * - Gone from the fresh read and *still upcoming* — ESI would have returned it,
 *   so absence means it was deleted or the invite was withdrawn in game. Drop
 *   it, or the board shows a cancelled event.
 *
 * A started event is kept for {@link RETENTION_MS} (two weeks) after it began, so
 * the pilot can look back at what they were invited to. This is a record of what
 * *this device saw before the event started*, not of everything that happened:
 * ESI has no past-events endpoint, so days the app was never open for stay
 * empty. `docs/features/calendar.md` states that limit.
 *
 * Pure (CLAUDE.md): ids and instants in, ids out. Engine-native shapes, so
 * `features/character/calendar.ts` adapts ESI's summaries at the boundary and
 * this module never learns what an `event_date` string looks like.
 */

/** How long after it starts a seen event stays on the board. */
export const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/** The instant an event stops being worth showing. */
export function retentionEndsAt(startMs: number): number {
  return startMs + RETENTION_MS;
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
