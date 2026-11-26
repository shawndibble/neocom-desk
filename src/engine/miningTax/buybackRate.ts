import type { EntryValuation } from './yieldValuation';

export const MIN_BUYBACK_RATE = 0;
export const MAX_BUYBACK_RATE = 100;
export const DEFAULT_BUYBACK_RATE = 100;

export function isValidBuybackRate(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_BUYBACK_RATE && value <= MAX_BUYBACK_RATE;
}

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

export function scaleUnitPrices(
  prices: ReadonlyMap<number, number>,
  ratePct: number
): ReadonlyMap<number, number> {
  const factor = ratePct / 100;
  return new Map([...prices].map(([typeId, price]) => [typeId, price * factor]));
}
