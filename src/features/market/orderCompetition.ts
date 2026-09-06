/**
 * Fetch + cache layer answering "who is cheaper, at what cost" for the
 * Market Orders page's undercut check (`engine/market/undercut.ts`'s
 * `CompetingOrder`/`UndercutScope`).
 *
 * Two tiers, deliberately asymmetric:
 *
 * - **Cheap tier — `loadStationBestPrices`.** A station's best sell/buy is
 *   one Fuzzwork aggregate lookup, batched across every station and item on
 *   the page in one go (`fetchAggregates` already chunks at 200 type ids).
 *   Cheap enough to run for every order on every refresh, so it always runs.
 * - **Expensive tier — `loadRegionCompetition`.** Answering "who beats me in
 *   my SYSTEM" or "in my REGION" needs the whole region order book for that
 *   one item — there is no batched, per-station equivalent of that call.
 *   So it is resolved on demand (one item at a time, when a row's detail is
 *   actually opened) rather than for the whole page eagerly. One call still
 *   answers all three `UndercutScope`s at once, because ESI's region order
 *   book carries both `location_id` AND `system_id` on every row.
 *
 * `loadRegionCompetition` wraps the EXISTING `getOrderBook` (300s TTL,
 * in-flight coalescing, ADR 0003) rather than adding a second cache layer —
 * see docs/ARCHITECTURE.md §7 step 3.
 */
import { fetchAggregates, type HubAggregate } from '@/market/fuzzwork';
import { getOrderBook } from './orderBook';
import { getRoute } from '@/esi/endpoints';
import { jumpsAwayFromRoute, type JumpsAwayResult } from '@/engine/jumpsAway';
import type { CompetingOrder } from '@/engine/market/undercut';

/** Cache key for `loadStationBestPrices`'s result map. */
function stationPriceKey(stationId: number, typeId: number): string {
  return `${stationId}:${typeId}`;
}

/**
 * Cheap tier: best sell/buy at a given station, batched across every station
 * and item on the page. One `fetchAggregates` call per station — type ids are
 * deduplicated per station first, and a station with no ids is skipped
 * entirely (no empty-batch call).
 *
 * One station's request failing (Fuzzwork down, a bad response) does not
 * drop the others: `fetchAggregates` throws on a non-ok response, so each
 * station's call is caught independently and that station's keys are simply
 * absent from the result, same "missing means unpriced" contract as a type
 * id Fuzzwork has no data for.
 */
export async function loadStationBestPrices(
  requests: readonly { stationId: number; typeIds: readonly number[] }[]
): Promise<Map<string, HubAggregate>> {
  const result = new Map<string, HubAggregate>();

  await Promise.all(
    requests.map(async ({ stationId, typeIds }) => {
      const uniqueTypeIds = Array.from(new Set(typeIds));
      if (uniqueTypeIds.length === 0) return;

      try {
        const aggregates = await fetchAggregates(stationId, uniqueTypeIds);
        for (const typeId of uniqueTypeIds) {
          const aggregate = aggregates.get(typeId);
          if (aggregate) result.set(stationPriceKey(stationId, typeId), aggregate);
        }
      } catch {
        // This station's prices are simply missing from the result.
      }
    })
  );

  return result;
}

export interface RegionCompetition {
  competitors: CompetingOrder[];
  fetchedAt: number;
  /** True when the region book had more pages than were collected. */
  truncated: boolean;
}

/**
 * Expensive tier: one item's whole book in one region, answering station,
 * system and region scopes at once. Maps ESI's `RegionOrder` (which carries
 * `location_id` AND `system_id`) onto `CompetingOrder`.
 */
export async function loadRegionCompetition(
  regionId: number,
  typeId: number
): Promise<RegionCompetition> {
  const { orders, truncated, fetchedAt } = await getOrderBook(regionId, typeId);
  const competitors: CompetingOrder[] = orders.map((o) => ({
    orderId: o.order_id,
    price: o.price,
    locationId: o.location_id,
    systemId: o.system_id,
    volumeRemain: o.volume_remain,
    isBuyOrder: o.is_buy_order,
  }));
  return { competitors, fetchedAt, truncated };
}

function jumpsCacheKey(originSystemId: number, destinationSystemId: number): string {
  return `${originSystemId}:${destinationSystemId}`;
}

// Module-level, session-lifetime memo: a route between two fixed systems
// cannot change inside a session, so a repeated pair (e.g. one hub compared
// against several of the character's home systems) never re-calls ESI.
const jumpsCache = new Map<string, Promise<JumpsAwayResult>>();

/** Clears the session memo — tests only. */
export function clearJumpsCache(): void {
  jumpsCache.clear();
}

/**
 * Jumps between two solar systems, memoized per ordered pair for the session.
 * Same system for both ends is 0 jumps with no ESI call. A route ESI cannot
 * resolve (or a failed call) degrades to `{kind:'unknown', reason:'noRoute'}`
 * rather than throwing — a route lookup failing must not take the rest of a
 * page's undercut check down with it.
 *
 * Only a `known` answer is retained in the memo. A transient failure resolves
 * to `unknown` for its caller but is then evicted, so a later call for the
 * same pair gets a fresh attempt rather than being stuck on a stale negative
 * for the rest of the session — same "don't poison the entry" rule
 * `esi/cache.ts`'s `inFlightLoads`/`orderBook.ts`'s `inFlight` both follow for
 * a rejection.
 */
export function loadJumpsBetween(
  originSystemId: number,
  destinationSystemId: number
): Promise<JumpsAwayResult> {
  if (originSystemId === destinationSystemId) {
    return Promise.resolve(jumpsAwayFromRoute([originSystemId]));
  }

  const key = jumpsCacheKey(originSystemId, destinationSystemId);
  const cached = jumpsCache.get(key);
  if (cached) return cached;

  const promise = (async () => {
    try {
      const { data } = await getRoute(originSystemId, destinationSystemId);
      return jumpsAwayFromRoute(data);
    } catch {
      return jumpsAwayFromRoute(null);
    }
  })();
  jumpsCache.set(key, promise);
  void promise.then((result) => {
    if (result.kind === 'unknown') jumpsCache.delete(key);
  });
  return promise;
}
