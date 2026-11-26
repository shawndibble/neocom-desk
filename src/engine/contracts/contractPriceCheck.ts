import type { PriceSide, SidePrices } from '@/engine/miningTax/priceBasis';

export function percentDifference(asking: number, reference: number): number | null {
  if (!(asking > 0) || !(reference > 0)) return null;
  return ((asking - reference) / reference) * 100;
}

export interface PriceCheckLine {
  typeId: number;
  quantity: number;
  unpriceable?: true;
}

export interface LinesValue {
  total: number;
  pricedLines: number;
  unpricedLines: number;
}

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
      value: number;
      diff: number | null;
      unpricedLines: number;
    }
  | { kind: 'unavailable' };

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
      diff: number | null;
      unpricedLines: number;
    }
  | { kind: 'unavailable' };

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
