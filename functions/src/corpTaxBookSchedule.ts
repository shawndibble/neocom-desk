// When the scheduled Corp Tax Book sync runs (ADR 0025): the books, then every moon owner.
// Dependency-free, so the client imports it too (the Moon owners tab's "next read" time).

import { DAY_MS, HOUR_MS, MINUTE_MS } from './timeConstants.js';

/** The UTC hours the scheduled sync fires in, at `BOOK_SYNC_MINUTE` past. */
export const BOOK_SYNC_HOURS_UTC = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22] as const;
export const BOOK_SYNC_MINUTE = 35;

/** The `syncCorpTaxBooks` schedule, built from the slots above. */
export const BOOK_SYNC_CRON = `${BOOK_SYNC_MINUTE} ${BOOK_SYNC_HOURS_UTC.join(',')} * * *`;

/** The start of the first scheduled run after `now` (a run starting at `now` counts as passed). */
export function nextScheduledBookSync(now: number): number {
  const day = now - (now % DAY_MS);
  for (const hour of BOOK_SYNC_HOURS_UTC) {
    const slot = day + hour * HOUR_MS + BOOK_SYNC_MINUTE * MINUTE_MS;
    if (slot > now) return slot;
  }
  return day + DAY_MS + BOOK_SYNC_HOURS_UTC[0] * HOUR_MS + BOOK_SYNC_MINUTE * MINUTE_MS;
}
