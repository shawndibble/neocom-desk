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
import { getHubPrices } from '@/market/prices';
import type { TradeHub } from '@/market/hubs';
import type { Fitting } from '@/engine/fittings/types';

const FULL_PRICE_PERCENT = 100;

function countTypeIds(fitting: Fitting): Map<number, number> {
  const counts = new Map<number, number>();
  const add = (typeId: number, quantity: number) => {
    counts.set(typeId, (counts.get(typeId) ?? 0) + quantity);
  };

  add(fitting.shipTypeId, 1);
  for (const module of fitting.modules) {
    add(module.typeId, 1);
    if (module.chargeTypeId !== undefined) add(module.chargeTypeId, 1);
  }
  for (const drone of fitting.drones) add(drone.typeId, drone.quantity);
  for (const item of fitting.cargo) add(item.typeId, item.quantity);

  return counts;
}

export async function loadFittingPrice(fitting: Fitting, hub: TradeHub): Promise<Appraisal> {
  const counts = countTypeIds(fitting);
  const typeIds = [...counts.keys()];
  const prices = await getHubPrices(hub, typeIds);

  const items = typeIds.map((typeId) => {
    const aggregate = prices.get(typeId);
    return {
      typeId,
      name: String(typeId),
      quantity: counts.get(typeId) ?? 0,
      buy: aggregate?.buyMax ?? null,
      sell: aggregate?.sellMin ?? null,
    };
  });

  return buildAppraisal(items, FULL_PRICE_PERCENT);
}
