/**
 * The shared policy for fetching detail rows ahead of being opened (mail
 * bodies, calendar event details), so those readers work offline. One place
 * for the bounds, so there is a single number to tune.
 *
 * Opt-in by data, not by page: a caller runs this after a successful list
 * sync (`mail.ts`, `calendar.ts`), never on its own schedule.
 */
import { inBackgroundLane } from '@/esi/lane';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { currentWarmLevel } from '@/lib/lazyAssetWarmGate';

/** Newest mail bodies kept ready per Character. */
export const MAIL_BODY_PREFETCH_LIMIT = 20;
/** Upcoming calendar events with details kept ready per Character. */
export const CALENDAR_PREFETCH_LIMIT = 20;
/** How far ahead a calendar event is worth its details. */
export const CALENDAR_PREFETCH_DAYS = 14;
/** Requests in flight at once: a trickle beside whatever the visible page is loading. */
export const DETAIL_PREFETCH_CONCURRENCY = 2;

/**
 * Whether background detail fetching may run now: online, not on Data Saver,
 * a slow link or a metered connection. Reuses the lazy-asset warm gate's
 * reading of the connection, and takes only its unrestricted level, since
 * this is optional traffic.
 */
export function detailPrefetchAllowed(): boolean {
  return currentWarmLevel() === 'all';
}

/** Loads each id in the background lane at low concurrency; a failed one is skipped, never thrown. */
export async function prefetchDetails(
  ids: readonly number[],
  load: (id: number) => Promise<unknown>
): Promise<void> {
  await mapWithConcurrencyLimit(ids, DETAIL_PREFETCH_CONCURRENCY, async (id) => {
    if (!detailPrefetchAllowed()) return;
    try {
      await inBackgroundLane(() => load(id));
    } catch {
      // The reader fetches it itself when opened; a warm-up never surfaces an error.
    }
  });
}
