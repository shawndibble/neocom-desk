import { describe, expect, it } from 'vitest';
import { buildBillBreakdown } from './billBreakdown';

describe('buildBillBreakdown', () => {
  const base = {
    oreLines: [
      { typeId: 1, quantity: 1000 },
      { typeId: 2, quantity: 500 },
    ],
    unitPrices: new Map([
      [1, 10],
      [2, 0],
    ]),
    sources: new Map([[1, 'saved' as const]]),
    taxPct: 10,
  };

  it('prices each line at its unit price and keeps its source', () => {
    const b = buildBillBreakdown(base);
    expect(b.lines[0]).toEqual({
      typeId: 1,
      quantity: 1000,
      unitPrice: 10,
      source: 'saved',
      lineValue: 10000,
      overridden: false,
    });
  });

  it('marks an ore with no price as unpriced', () => {
    const b = buildBillBreakdown(base);
    expect(b.lines[1]).toMatchObject({ unitPrice: undefined, source: 'none', lineValue: 0 });
  });

  it('uses a per-ore override as the line value and flags it', () => {
    const b = buildBillBreakdown({ ...base, oreLineValues: { 1: 7777 } });
    expect(b.lines[0]).toMatchObject({ lineValue: 7777, overridden: true });
  });

  it('sums line values and applies tax', () => {
    const b = buildBillBreakdown(base);
    expect(b.derivedValue).toBe(10000);
    expect(b.derivedTax).toBe(1000);
  });
});
