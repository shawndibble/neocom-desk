/**
 * Persistence for the Open Orders page's rolling `OrderProblem` history —
 * the Dexie half of `engine/market/orderProblemHistory.ts`, which owns the
 * pure window/dedupe/cap rules and the verdict itself.
 *
 * Sampling runs from the page rather than the Foreground Poller because an
 * order's `OrderProblem` is not computable where the poller runs; the
 * reasoning is in
 * `docs/context/decisions/20260914-135534-often-undercut-flag-samples-on-the-open-orders.md`.
 */
import { db, type OrderProblemSampleRecord } from '@/db';
import {
  appendOrderProblemSample,
  type OrderProblemSample,
} from '@/engine/market/orderProblemHistory';
import type { OrderProblem } from '@/engine/market/orderProblems';
import type { CharacterOpenOrders } from './openOrdersData';

/** One order's classification at the moment the page computed its rows. */
export interface OrderProblemReading {
  orderId: number;
  characterId: number;
  problem: OrderProblem;
}

/**
 * The characters a load may prune, out of the ones it returned: those whose
 * open orders were genuinely read.
 *
 * `loadAllCharactersOpenOrders` keeps two kinds of failure in `entries`
 * rather than `skipped`, both with an empty `orders` array, so that the
 * page can render a per-character prompt on that row instead of the row
 * vanishing: a character needing re-auth (`needsReauth`), and one whose
 * fetch returned no cache at all (offline or a cold first load), which shows
 * up as `fetchedAt: 0`. Either one looks exactly like "every order closed"
 * to a prune that only reads order ids — and would silently delete weeks of
 * that character's samples. A character with a real, genuinely empty order
 * list still carries a real `fetchedAt`, so actual closures prune normally.
 */
export function sampleableCharacterIds(entries: readonly CharacterOpenOrders[]): number[] {
  return entries
    .filter((entry) => !entry.needsReauth && entry.fetchedAt > 0)
    .map((entry) => entry.characterId);
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
 * The prune is scoped to `characterIds`, which callers build with
 * `sampleableCharacterIds` — the characters whose orders were genuinely
 * read. A global "delete every order id not in `readings`" would erase weeks
 * of samples for any character that was signed out, offline, or whose own
 * `loadOrders` failed, with no error to show for it.
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
