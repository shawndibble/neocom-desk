import { DAY_MS, HOUR_MS, MINUTE_MS } from './timeConstants.js';

export const BOOK_SYNC_HOURS_UTC = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22] as const;
export const BOOK_SYNC_MINUTE = 35;

export const BOOK_SYNC_CRON = `${BOOK_SYNC_MINUTE} ${BOOK_SYNC_HOURS_UTC.join(',')} * * *`;

export function nextScheduledBookSync(now: number): number {
  const day = now - (now % DAY_MS);
  for (const hour of BOOK_SYNC_HOURS_UTC) {
    const slot = day + hour * HOUR_MS + BOOK_SYNC_MINUTE * MINUTE_MS;
    if (slot > now) return slot;
  }
  return day + DAY_MS + BOOK_SYNC_HOURS_UTC[0] * HOUR_MS + BOOK_SYNC_MINUTE * MINUTE_MS;
}
