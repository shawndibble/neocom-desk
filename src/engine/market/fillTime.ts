/**
 * When a sell order actually finished filling, worked out from the wallet.
 *
 * ESI never says when an order filled: order history records when it was
 * *issued*, and wallet transactions carry no order id. What a transaction
 * does carry — item, station, unit price, buy/sell, date — pins it to an
 * order closely enough: an order's sales are at its own price, at its own
 * station, after it was issued (or last re-priced, which re-stamps `issued`).
 * The newest such sale is the one that emptied it.
 *
 * The wallet refreshes far less often than orders do (ESI caches
 * transactions for an hour, orders for twenty minutes), so the poll that
 * notices a fill usually cannot see the sale that caused it yet. Hence three
 * answers rather than two: `pending` means "ask again later", and only data
 * provably newer than the fill may conclude there is nothing to find.
 *
 * Pure: no fetch, no DOM, no clock.
 */

/** What the fill alert remembers about its order, to find the order's sales later. */
export interface FillMatch {
  typeId: number;
  locationId: number;
  /** The order's unit price — every sale it made was at this price. */
  price: number;
  /** ESI's `issued`, epoch ms; a re-price re-stamps it, so no matching sale predates it. */
  issuedMs: number;
  /** Units the order was for (`volume_total`). */
  quantity: number;
}

/** A wallet transaction, adapted from ESI's shape at the caller. */
export interface FillTransaction {
  dateMs: number;
  typeId: number;
  locationId: number;
  unitPrice: number;
  quantity: number;
  isBuy: boolean;
}

export type FillTimeResolution =
  | { status: 'settled'; fillMs: number }
  /** The wallet data is new enough to have shown the sale, and does not. */
  | { status: 'unmatched' }
  /** The wallet data may predate the final sale — try again on a later poll. */
  | { status: 'pending' };

/**
 * How far wallet transactions can trail the moment they are fetched: ESI's
 * one-hour cache, plus slack for a fetch landing just before a refresh.
 */
export const WALLET_TRANSACTIONS_LAG_MS = 65 * 60_000;

/** ISK prices go to the cent; compare in cents so float noise never splits a match. */
function sameCents(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/**
 * `observedAtMs` is when the poll noticed the fill; `fetchedAtMs` is when the
 * transactions were fetched. Settles early when the matching sales already
 * account for the whole order. Otherwise — a re-priced order's earlier sales
 * carry the old price and no longer match — it waits until the data is
 * provably newer than the fill, then takes the newest match it has.
 *
 * Known limitation: a second order for the same item, at the same price and
 * station, that also sold since this one was issued is indistinguishable
 * without an order id; its sales count here too. The date that results is
 * still a real sale of this item at this price.
 */
export function resolveFillTime(
  match: FillMatch,
  transactions: readonly FillTransaction[],
  observedAtMs: number,
  fetchedAtMs: number
): FillTimeResolution {
  let newestMs = -Infinity;
  let sold = 0;
  for (const row of transactions) {
    if (row.isBuy) continue;
    if (row.typeId !== match.typeId || row.locationId !== match.locationId) continue;
    if (!sameCents(row.unitPrice, match.price)) continue;
    if (row.dateMs < match.issuedMs) continue;
    sold += row.quantity;
    newestMs = Math.max(newestMs, row.dateMs);
  }

  const found = sold > 0;
  // Clamped: the fill cannot have happened after the poll that saw it; a
  // later date is ESI's clock running ahead of this device's.
  const settled = (): FillTimeResolution => ({
    status: 'settled',
    fillMs: Math.min(newestMs, observedAtMs),
  });
  if (found && sold >= match.quantity) return settled();
  if (fetchedAtMs - WALLET_TRANSACTIONS_LAG_MS < observedAtMs) return { status: 'pending' };
  return found ? settled() : { status: 'unmatched' };
}
