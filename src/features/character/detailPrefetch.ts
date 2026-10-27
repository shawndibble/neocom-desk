/**
 * The shared policy for fetching detail rows ahead of being opened (mail
 * bodies, calendar event details), so those readers work offline. One place
 * for the bounds, so there is a single number to tune.
 *
 * The one source of truth for when it runs: after a list load that really
 * reached ESI (`fromCache` false), from two triggers only, the boot warm-up
 * (`app/prefetch.ts`, for the active Character and then every other one that
 * holds the scope) and the Foreground Poller's mail and calendar domains
 * (`notifications/pollDomains`). Never on its own schedule, and never from a
 * page load.
 */
import { cachedKeySet } from '@/esi/cache';
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

/** Ids already tried this session that still left no cached row, per kind and Character. */
const failedThisSession = new Map<string, Set<number>>();

function failedIds(kind: string, characterId: number): Set<number> {
  const key = `${kind}:${characterId}`;
  let ids = failedThisSession.get(key);
  if (ids === undefined) {
    ids = new Set();
    failedThisSession.set(key, ids);
  }
  return ids;
}

/** Tests only: forget which ids failed this session. */
export function resetDetailPrefetchForTests(): void {
  failedThisSession.clear();
}

/**
 * Loads each id in the background lane at low concurrency; a failed one is
 * skipped, never thrown. Resolves to the ids it actually tried (a run stops
 * trying once the gate closes, say on going offline mid-way).
 */
export async function prefetchDetails(
  ids: readonly number[],
  load: (id: number) => Promise<unknown>
): Promise<number[]> {
  const attempted: number[] = [];
  await mapWithConcurrencyLimit(ids, DETAIL_PREFETCH_CONCURRENCY, async (id) => {
    if (!detailPrefetchAllowed()) return;
    attempted.push(id);
    try {
      await inBackgroundLane(() => load(id));
    } catch {
      // The reader fetches it itself when opened; a warm-up never surfaces an error.
    }
  });
  return attempted;
}

/**
 * Fetches the detail rows a list is missing, so the reader works offline.
 * `select` picks the ids from the list, being told which to leave alone: the
 * ones already cached and the ones that failed earlier this session (deleted
 * mail, a 403 or 404 would otherwise be asked for again on every tick and
 * every boot). An id that was tried and still has no row afterwards counts as
 * failed. Gate, bounds and the lane are `prefetchDetails`'s; never rejects.
 */
export async function prefetchMissing(input: {
  /** What is being fetched, to keep one kind's failures apart from another's. */
  kind: 'mail-body' | 'calendar-event';
  characterId: number;
  /** Every id in the list, for the cached check. */
  allIds: readonly number[];
  /** The `esiCache` key an id's detail row is stored under. */
  keyOf: (id: number) => string;
  select: (skip: ReadonlySet<number>) => number[];
  load: (id: number) => Promise<unknown>;
}): Promise<void> {
  try {
    if (!detailPrefetchAllowed()) return;
    const cachedKeys = await cachedKeySet(input.characterId, input.allIds.map(input.keyOf));
    // A purge is pending: nothing may be read or written for this Character.
    if (cachedKeys === null) return;
    const failed = failedIds(input.kind, input.characterId);
    const skip = new Set(
      input.allIds.filter((id) => cachedKeys.has(input.keyOf(id)) || failed.has(id))
    );
    const attempted = await prefetchDetails(input.select(skip), input.load);
    if (attempted.length === 0) return;
    const after = await cachedKeySet(input.characterId, attempted.map(input.keyOf));
    if (after === null) return;
    for (const id of attempted) if (!after.has(input.keyOf(id))) failed.add(id);
  } catch {
    // Warm-up only: the reader fetches what it needs when opened.
  }
}
