export interface DepthOrder {
  order_id: number;
  price: number;
  volume_remain: number;
}

export interface DepthAt {
  units: number;
  isk: number;
}

export function bookDepth(side: readonly DepthOrder[]): Map<number, DepthAt> {
  const depth = new Map<number, DepthAt>();
  let units = 0;
  let isk = 0;
  for (const order of side) {
    units += order.volume_remain;
    isk += order.price * order.volume_remain;
    depth.set(order.order_id, { units, isk });
  }
  return depth;
}

export function sortBookSide<T extends { price: number; system_id: number }>(
  side: readonly T[],
  kind: 'sell' | 'buy',
  distanceOf: (systemId: number) => number | null
): T[] {
  const sign = kind === 'sell' ? 1 : -1;
  const reach = (order: T) => distanceOf(order.system_id) ?? Number.MAX_SAFE_INTEGER;
  return [...side].sort((a, b) => (a.price - b.price) * sign || reach(a) - reach(b));
}

export const SELL_OUTLIER_FACTOR = 10;

export function sellOutlierMultiple(price: number, bestSell: number | null): number | null {
  if (bestSell === null || bestSell <= 0) return null;
  const multiple = price / bestSell;
  return multiple >= SELL_OUTLIER_FACTOR ? multiple : null;
}

export function withoutBaitSells<T extends { price: number }>(
  sell: readonly T[],
  bestSell: number | null
): T[] {
  return sell.filter((o) => sellOutlierMultiple(o.price, bestSell) === null);
}

export interface PriceComparison {
  delta: number;
  ratio: number;
}

export function priceComparison(base: number | null, other: number | null): PriceComparison | null {
  if (base === null || other === null || base <= 0) return null;
  const delta = other - base;
  return { delta, ratio: delta / base };
}

export function comparisonPct(comparison: PriceComparison | null): number | null {
  return comparison === null ? null : comparison.ratio * 100;
}
