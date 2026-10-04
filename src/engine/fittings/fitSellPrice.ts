/**
 * What a fit costs at a Trade Hub, from its item counts and that hub's
 * prices. Shared by the Fitting's Price section (`features/fittings/
 * fittingPrice.ts`) and each EVE Workbench row's price, so "what this fit
 * costs" means the same thing in both: every item through `buildAppraisal` at
 * 100% of market.
 *
 * A row's price is the **sell** total — the figure the Price section
 * headlines: what buying the fit off the hub's sell orders costs. An item
 * with no sell order there is left out of the total rather than counted as
 * free, and the total says it is partial; a fit with nothing priced at all
 * has no price, never 0.
 *
 * Pure: the caller fetches the prices (`market/prices.ts`).
 */
import { buildAppraisal, type AppraisalItem } from '@/engine/market/appraisal';

/** The two sides of a hub's order book for one type — `HubAggregate` fits this. */
export interface HubSides {
  sellMin: number | null;
  buyMax: number | null;
}

/** `[typeId, quantity]` pairs, one per type. */
export type ItemCounts = Iterable<ItemCount>;

/** One type and how many of it. */
export type ItemCount = readonly [typeId: number, quantity: number];

/** Every fit price is quoted at full market price, never a Price Percent. */
export const FULL_PRICE_PERCENT = 100;

/**
 * Each counted type as an `AppraisalItem` priced from `prices`; a type with no
 * entry gets null on both sides. `name` is the bare typeId: nothing reading
 * these renders a per-item row.
 */
export function fitAppraisalItems(
  counts: ItemCounts,
  prices: ReadonlyMap<number, HubSides>
): AppraisalItem[] {
  return [...counts].map(([typeId, quantity]) => {
    const sides = prices.get(typeId);
    return {
      typeId,
      name: String(typeId),
      quantity,
      buy: sides?.buyMax ?? null,
      sell: sides?.sellMin ?? null,
    };
  });
}

export interface FitSellPrice {
  /** Summed over the types with a sell order at the hub. */
  sell: number;
  /** At least one type had no sell order, so `sell` is a lower bound. */
  partial: boolean;
  /** How many types had no sell order. */
  unpricedTypes: number;
}

/** The fit's sell total at 100%; `null` when no item has a sell order there. */
export function fitSellPrice(
  counts: ItemCounts,
  prices: ReadonlyMap<number, HubSides>
): FitSellPrice | null {
  const { rows, totals } = buildAppraisal(fitAppraisalItems(counts, prices), FULL_PRICE_PERCENT);
  // Sell side only: `totals.unpricedRows` also counts a missing buy order,
  // which says nothing about whether this total is complete.
  const unpricedTypes = rows.filter((row) => row.sellTotal === null).length;
  if (unpricedTypes === rows.length) return null;
  return { sell: totals.sell, partial: unpricedTypes > 0, unpricedTypes };
}
