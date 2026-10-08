/**
 * The per-ore arithmetic behind a Tax bill (issue #2832): what unit price,
 * from which source, produced each line. Pure shapes only — the row detail
 * renders it and turns it into the text a pilot pastes to the landlord.
 */
import type { TaxPriceSource } from './priceBasis';
import type { OreLine } from './types';

export interface BillBreakdownInput {
  oreLines: readonly OreLine[];
  /** Per-unit buy price by raw typeId; 0 or absent = unpriced. */
  unitPrices: ReadonlyMap<number, number>;
  sources: ReadonlyMap<number, TaxPriceSource>;
  /** Per-ore total overrides ("Edit ore values individually"), by typeId. */
  oreLineValues?: Readonly<Record<number, number>>;
  taxPct: number;
}

export interface BillBreakdownLine {
  typeId: number;
  quantity: number;
  unitPrice: number | undefined;
  source: TaxPriceSource;
  lineValue: number;
  /** True when the line value is a hand-edited total, not quantity x unit price. */
  overridden: boolean;
}

export interface BillBreakdown {
  lines: BillBreakdownLine[];
  derivedValue: number;
  derivedTax: number;
}

export function buildBillBreakdown(input: BillBreakdownInput): BillBreakdown {
  const lines = input.oreLines.map((line): BillBreakdownLine => {
    const price = input.unitPrices.get(line.typeId);
    const unitPrice = price !== undefined && price > 0 ? price : undefined;
    const override = input.oreLineValues?.[line.typeId];
    const overridden = override !== undefined;
    return {
      typeId: line.typeId,
      quantity: line.quantity,
      unitPrice,
      source: unitPrice === undefined ? 'none' : (input.sources.get(line.typeId) ?? 'none'),
      lineValue: overridden ? override : line.quantity * (unitPrice ?? 0),
      overridden,
    };
  });
  const derivedValue = lines.reduce((sum, l) => sum + l.lineValue, 0);
  return { lines, derivedValue, derivedTax: (derivedValue * input.taxPct) / 100 };
}
