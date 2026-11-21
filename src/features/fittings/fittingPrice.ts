/**
 * Prices an open Fitting at a Trade Hub — the ticket's "Price (Jita sell/buy
 * via the Appraisal engine)" section. Independent of the dogma engine: this
 * only needs a hub's order book (`market/prices.ts`), never a fit
 * calculation, which is why the ticket has it show immediately while the
 * stats sections are still downloading ship data.
 *
 * Reuses `buildAppraisal` (the Appraisal tab's own totals engine) rather than
 * summing prices by hand, so "what this fit is worth" always means the same
 * thing here as it does on the Market page. `name` on each constructed
 * `AppraisalItem` is the bare typeId: nothing in this ticket renders a
 * per-item row, only the fit-wide `totals.buy`/`totals.sell`.
 */
import { buildAppraisal, type Appraisal } from '@/engine/market/appraisal';
import { FULL_PRICE_PERCENT, fitAppraisalItems } from '@/engine/fittings/fitSellPrice';
import { getHubPricesAt } from '@/features/market/hubPricesAtPercent';
import type { TradeHub } from '@/market/hubs';
import { fittingItemCounts } from '@/engine/fittings/fittingExport';
import type { Fitting } from '@/engine/fittings/types';

/**
 * The rows with no sell order at the hub. A fit is priced on sell orders alone
 * (what buying it off the hub costs), so a missing buy order is not a gap:
 * `totals.unpricedRows` counts it as one, which is why callers use this.
 */
export function unpricedSellRows<T extends { sellTotal: number | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.sellTotal === null);
}

/**
 * `cloneImplants`: the pilot's active clone, whose implants are already bought (`fittingItemCounts`).
 * `percent`: the Fittings page's price percent (`pagePricePercents.ts`), 100 for the hub's own prices.
 */
export async function loadFittingPrice(
  fitting: Fitting,
  hub: TradeHub,
  cloneImplants: readonly number[] = [],
  percent = 100
): Promise<Appraisal> {
  const counts = fittingItemCounts(fitting, cloneImplants);
  const prices = await getHubPricesAt(hub, [...counts.keys()], percent);
  // The same items an EVE Workbench row is priced from (`fitSellPrice.ts`).
  return buildAppraisal(fitAppraisalItems(counts, prices), FULL_PRICE_PERCENT);
}
