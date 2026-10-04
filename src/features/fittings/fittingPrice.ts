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
import { getHubPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import { fittingItemCounts } from '@/engine/fittings/fittingExport';
import type { Fitting } from '@/engine/fittings/types';

export async function loadFittingPrice(fitting: Fitting, hub: TradeHub): Promise<Appraisal> {
  const counts = fittingItemCounts(fitting);
  const prices = await getHubPrices(hub, [...counts.keys()]);
  // The same items an EVE Workbench row is priced from (`fitSellPrice.ts`).
  return buildAppraisal(fitAppraisalItems(counts, prices), FULL_PRICE_PERCENT);
}
