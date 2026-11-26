import { buildAppraisal, type AppraisalItem } from '@/engine/market/appraisal';

export interface HubSides {
  sellMin: number | null;
  buyMax: number | null;
}

export type ItemCounts = Iterable<ItemCount>;

export type ItemCount = readonly [typeId: number, quantity: number];

export const FULL_PRICE_PERCENT = 100;

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
  sell: number;
  partial: boolean;
  unpricedTypes: number;
}

export function fitSellPrice(
  counts: ItemCounts,
  prices: ReadonlyMap<number, HubSides>
): FitSellPrice | null {
  const { rows, totals } = buildAppraisal(fitAppraisalItems(counts, prices), FULL_PRICE_PERCENT);
  const unpricedTypes = rows.filter((row) => row.sellTotal === null).length;
  if (unpricedTypes === rows.length) return null;
  return { sell: totals.sell, partial: unpricedTypes > 0, unpricedTypes };
}
