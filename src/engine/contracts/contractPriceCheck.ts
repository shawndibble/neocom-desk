/**
 * The contract detail panels' price check: what a contract's items are worth
 * at the hub, and how far the ask sits from that. Pure — the caller fetches
 * the prices (an issue-day Open Price, or the live book) and hands them in.
 *
 * Every figure is a plain comparison. The reader's side of the contract is
 * unknown, so nothing here says "good" or "bad" (decision 20261020-005242-contract-detail-price-check).
 */
import type { PriceSide, SidePrices } from '@/engine/miningTax/priceBasis';

/**
 * Percent the ask sits from the reference: negative below it, positive above.
 * `null` with no reference, or for a zero ask — a barter, which is the absence
 * of a price rather than a price of zero (decision
 * 20260915-102046-zero-price-contract-treated-as-unpriceable-barter-marked).
 */
export function percentDifference(asking: number, reference: number): number | null {
  if (!(asking > 0) || !(reference > 0)) return null;
  return ((asking - reference) / reference) * 100;
}

/** One item line of a contract: a type and how many of it. */
export interface PriceCheckLine {
  typeId: number;
  quantity: number;
  /**
   * The hub has no price for this line whatever its type's book says: a
   * blueprint *copy* shares a type with the original, which trades, but a copy
   * never does. Counted unpriced, so the original's price never stands in for it.
   */
  unpriceable?: true;
}

export interface LinesValue {
  /** Priced lines only: an unpriced line is not worth 0, it is not counted. */
  total: number;
  pricedLines: number;
  unpricedLines: number;
}

/**
 * Quantity times unit price, summed. A missing, null or zero unit price is
 * "no price" (a blueprint, a type with no orders on that side): the line is
 * counted in `unpricedLines` and left out of `total`, so the caller can say
 * "N items unpriced" instead of printing a total that quietly undercounts.
 */
export function valueLines(
  lines: readonly PriceCheckLine[],
  unitPrices: ReadonlyMap<number, number | null>
): LinesValue {
  let total = 0;
  let pricedLines = 0;
  for (const line of lines) {
    const unit = line.unpriceable ? null : unitPrices.get(line.typeId);
    if (unit == null || !(unit > 0)) continue;
    total += unit * line.quantity;
    pricedLines += 1;
  }
  return { total, pricedLines, unpricedLines: lines.length - pricedLines };
}

export type IskPriceCheck =
  | {
      kind: 'priced';
      asking: number;
      /** What the priced lines come to on the chosen side. */
      value: number;
      /** Percent the ask sits from `value`; `null` for a zero ask. */
      diff: number | null;
      /** Lines left out of `value` for want of a price. */
      unpricedLines: number;
    }
  | { kind: 'unavailable' };

/**
 * An item exchange for ISK: the asking price against what the included items
 * come to at the hub. The caller chooses where the prices come from (the
 * Open Price of the issue day, or the live book) and which side to value at.
 * With nothing priceable it says so, so the panel never shows a 0 ISK value.
 */
export function iskPriceCheck(args: {
  asking: number;
  included: readonly PriceCheckLine[];
  prices: ReadonlyMap<number, SidePrices>;
  side: PriceSide;
}): IskPriceCheck {
  const value = valueLines(args.included, unitPricesOn(args.prices, args.side));
  if (value.pricedLines === 0) return { kind: 'unavailable' };
  return {
    kind: 'priced',
    asking: args.asking,
    value: value.total,
    diff: percentDifference(args.asking, value.total),
    unpricedLines: value.unpricedLines,
  };
}

/** One side of each type's prices as a plain per-unit map; `null` where that side has no orders. */
export function unitPricesOn(
  prices: ReadonlyMap<number, SidePrices>,
  side: PriceSide
): ReadonlyMap<number, number | null> {
  const units = new Map<number, number | null>();
  for (const [typeId, sides] of prices) units.set(typeId, sides[side]);
  return units;
}

export type ItemSwapPriceCheck =
  | {
      kind: 'priced';
      included: number;
      requested: number;
      /** Percent Included sits from Requested. */
      diff: number | null;
      unpricedLines: number;
    }
  | { kind: 'unavailable' };

/**
 * Items for items, no ISK: what each side comes to at the same hub and side,
 * and how far Included sits from Requested. If either side has nothing
 * priceable it is unavailable, not a one-sided figure.
 */
export function itemSwapPriceCheck(args: {
  included: readonly PriceCheckLine[];
  requested: readonly PriceCheckLine[];
  prices: ReadonlyMap<number, SidePrices>;
  side: PriceSide;
}): ItemSwapPriceCheck {
  const units = unitPricesOn(args.prices, args.side);
  const included = valueLines(args.included, units);
  const requested = valueLines(args.requested, units);
  if (included.pricedLines === 0 || requested.pricedLines === 0) return { kind: 'unavailable' };
  return {
    kind: 'priced',
    included: included.total,
    requested: requested.total,
    diff: percentDifference(included.total, requested.total),
    unpricedLines: included.unpricedLines + requested.unpricedLines,
  };
}

/**
 * What the shopper searched for against everything else in the bundle, so a
 * contract that is mostly something they did not ask for says so. `null` when
 * no search is active or no line matches: nothing is tagged then, and there is
 * no "other" to speak of.
 */
export function splitBySearch(
  lines: readonly PriceCheckLine[],
  searchedTypeIds: ReadonlySet<number> | null,
  unitPrices: ReadonlyMap<number, number | null>
): { mine: LinesValue; rest: LinesValue } | null {
  if (!searchedTypeIds) return null;
  const mine = lines.filter((line) => searchedTypeIds.has(line.typeId));
  if (mine.length === 0) return null;
  const rest = lines.filter((line) => !searchedTypeIds.has(line.typeId));
  return { mine: valueLines(mine, unitPrices), rest: valueLines(rest, unitPrices) };
}
