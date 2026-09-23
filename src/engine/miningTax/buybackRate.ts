/**
 * The Mining Yield Overview's buyback rate (issue #1280): many corps pay a
 * percentage of Jita price rather than the full book, commonly around 90%.
 * One page-wide rate, not per character — 100 is off (full market price).
 *
 * A pure multiplier on price, unrelated to `PriceSource`/`pricedAll`: it says
 * nothing about where a price came from, only what fraction of it is paid.
 */
import type { EntryValuation } from './yieldValuation';

export const MIN_BUYBACK_RATE = 0;
export const MAX_BUYBACK_RATE = 100;
export const DEFAULT_BUYBACK_RATE = 100;

export function isValidBuybackRate(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_BUYBACK_RATE && value <= MAX_BUYBACK_RATE;
}

/**
 * Scales every ISK figure an `EntryValuation` carries — the entry's own
 * totals and each ore line's — by `ratePct / 100`. Quantities, pricing
 * metadata (`pricedAll`, `priceSource`) and reprocessing detail (`efficiency`,
 * `refineOutputs`, `batches`, `unitsLeftOver`) are facts about the ore and the
 * character, not the price, so they pass through unscaled.
 */
export function scaleValuation(valuation: EntryValuation, ratePct: number): EntryValuation {
  const factor = ratePct / 100;
  return {
    ...valuation,
    rawValue: valuation.rawValue * factor,
    refineValue: valuation.refineValue * factor,
    lines: valuation.lines.map((line) => ({
      ...line,
      rawValue: line.rawValue * factor,
      refineValue: line.refineValue * factor,
    })),
  };
}

/**
 * Scales the detail modal's per-material unit prices the same way, so its
 * "refines into" list matches a scaled `EntryValuation`'s totals rather than
 * quoting full market price alongside a discounted total.
 */
export function scaleUnitPrices(
  prices: ReadonlyMap<number, number>,
  ratePct: number
): ReadonlyMap<number, number> {
  const factor = ratePct / 100;
  return new Map([...prices].map(([typeId, price]) => [typeId, price * factor]));
}
