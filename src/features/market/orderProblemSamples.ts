/**
 * Persistence for the Open Orders page's rolling `OrderProblem` history
 * (issue #1018) — the Dexie half of `engine/market/orderProblemHistory.ts`,
 * which owns the pure window/dedupe/cap rules and the verdict itself.
 *
 * Why the sampling happens here, on the page, and not in
 * `features/notifications/pollDomains.ts` as the ticket's brief assumed: an
 * order's `OrderProblem` is not computable from the poller's data. The
 * classification needs Fuzzwork station aggregates and a cost basis
 * (`buildOpenOrderRows`), and the poller loads neither — `fetchAggregates`
 * has no cache layer, so having the poller classify would mean an uncached
 * third-party request per station every 5 minutes for every user, including
 * ones who never open this tab. The Open Orders route already reloads on the
 * poller's own ESI cache revalidation, so leaving the tab open samples at
 * roughly that same cadence for free, and a shut tab simply records nothing
 * — the gappy series the badge is deliberately coarse about.
 */
import { db, type OrderProblemSampleRecord } from '@/db';
import {
  appendOrderProblemSample,
  type OrderProblemSample,
} from '@/engine/market/orderProblemHistory';
import type { OrderProblem } from '@/engine/market/orderProblems';

/** One order's classification at the moment the page computed its rows. */
export interface OrderProblemReading {
  orderId: number;
  characterId: number;
  problem: OrderProblem;
}

/**
 * Every stored history for the given characters, keyed by order id.
 *
 * Scoped to the characters the caller actually loaded for the same reason
 * the prune below is: a character missing from this list is one whose orders
 * could not be read this time, and its history must be left alone rather
 * than treated as absent.
 */
export async function loadOrderProblemSamples(
  characterIds: readonly number[]
): Promise<Map<number, readonly OrderProblemSample[]>> {
  const byOrderId = new Map<number, readonly OrderProblemSample[]>();
  if (characterIds.length === 0) return byOrderId;
  const rows = await db.orderProblemSamples
    .where('characterId')
    .anyOf([...characterIds])
    .toArray();
  for (const row of rows) byOrderId.set(row.orderId, row.samples);
  return byOrderId;
}

/**
 * Records one reading per open order and drops the history of orders that
 * are gone (filled, cancelled or expired), all in one transaction.
 *
 * The prune is scoped to `characterIds` — the characters whose orders this
 * load actually saw. A global "delete every order id not in `readings`"
 * would erase weeks of samples for any character whose own `loadOrders`
 * failed or who was signed out when the page loaded, with no error to show
 * for it.
 *
 * Rows whose new sample is dropped for spacing are not rewritten:
 * `appendOrderProblemSample` returns the same array reference in that case,
 * so an ordinary re-render costs no write at all.
 */
export async function recordOrderProblemSamples(
  readings: readonly OrderProblemReading[],
  characterIds: readonly number[],
  nowMs: number
): Promise<void> {
  if (characterIds.length === 0) return;
  const openIds = new Set(readings.map((reading) => reading.orderId));

  await db.transaction('rw', db.orderProblemSamples, async () => {
    const existing = await db.orderProblemSamples
      .where('characterId')
      .anyOf([...characterIds])
      .toArray();
    const byOrderId = new Map(existing.map((row) => [row.orderId, row]));

    const staleIds = existing.filter((row) => !openIds.has(row.orderId)).map((row) => row.orderId);
    if (staleIds.length > 0) await db.orderProblemSamples.bulkDelete(staleIds);

    const updates: OrderProblemSampleRecord[] = [];
    for (const reading of readings) {
      const row = byOrderId.get(reading.orderId);
      const samples = appendOrderProblemSample(row?.samples ?? [], {
        at: nowMs,
        problem: reading.problem,
      });
      if (row && samples === row.samples) continue;
      updates.push({
        orderId: reading.orderId,
        characterId: reading.characterId,
        samples: [...samples],
      });
    }
    if (updates.length > 0) await db.orderProblemSamples.bulkPut(updates);
  });
}
