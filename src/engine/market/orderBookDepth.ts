/**
 * Order Book depth: what one side of the book adds up to as a reader walks it
 * best-first — the Market Browser's Cum. qty column and an expanded row's
 * "buying down to here". Pure; callers pass one side already sorted
 * best-first (sell cheapest first, buy highest first).
 */

export interface DepthOrder {
  order_id: number;
  price: number;
  volume_remain: number;
}

export interface DepthAt {
  /** Units on this order and every better-priced one before it. */
  units: number;
  /** What taking all of those units costs (sell) or pays (buy). */
  isk: number;
}

/** Running units/ISK per order id, walking `side` in the order given. */
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

/**
 * One side of the book best-first — sell cheapest, buy highest — with a price
 * tie broken by distance from the reader, nearest first, so three orders at
 * 550,000 lead with the one in your own system. An order `distanceOf` can't
 * place (`null`) sits after the measured ones at its price. Returns a copy.
 */
export function sortBookSide<T extends { price: number; system_id: number }>(
  side: readonly T[],
  kind: 'sell' | 'buy',
  distanceOf: (systemId: number) => number | null
): T[] {
  const sign = kind === 'sell' ? 1 : -1;
  const reach = (order: T) => distanceOf(order.system_id) ?? Number.MAX_SAFE_INTEGER;
  return [...side].sort((a, b) => (a.price - b.price) * sign || reach(a) - reach(b));
}

/** A sell order asking this many times the best sell or more reads as bait, not a price. */
export const SELL_OUTLIER_FACTOR = 10;

/**
 * How many times the best sell a bait-priced sell order asks — 567,100,000
 * against a 550,000 book — or `null` for an ordinary order. Flagged, never
 * hidden: the row stays in the book, it just stops reading as a real price.
 */
export function sellOutlierMultiple(price: number, bestSell: number | null): number | null {
  if (bestSell === null || bestSell <= 0) return null;
  const multiple = price / bestSell;
  return multiple >= SELL_OUTLIER_FACTOR ? multiple : null;
}

export interface PriceComparison {
  /** `other` minus `base`: negative when `other` is cheaper. */
  delta: number;
  /** `delta` as a fraction of `base` (-0.35 is "35% less"). */
  ratio: number;
}

/**
 * `other` against `base`: the header's hub against the best a Jump Range
 * found, or a variation against the item it varies. `null` when either side
 * has no price.
 */
export function priceComparison(base: number | null, other: number | null): PriceComparison | null {
  if (base === null || other === null || base <= 0) return null;
  const delta = other - base;
  return { delta, ratio: delta / base };
}
