import { describe, it, expect } from 'vitest';
import { rawValueFormula } from './priceFormula';

function line(typeId: number, quantity: number, rawValue: number) {
  return { typeId, quantity, rawValue };
}

describe('rawValueFormula', () => {
  it('states each ore line as quantity times its full-price unit price', () => {
    const formula = rawValueFormula([line(1230, 1000, 12500), line(1228, 400, 8000)], 100);
    expect(formula.terms).toEqual([
      { typeId: 1230, quantity: 1000, unitPrice: 12.5 },
      { typeId: 1228, quantity: 400, unitPrice: 20 },
    ]);
    expect(formula.total).toBe(20500);
  });

  it('applies the buyback rate once, to the summed lines', () => {
    const formula = rawValueFormula([line(1230, 1000, 12500), line(1228, 400, 8000)], 90);
    expect(formula.ratePct).toBe(90);
    expect(formula.total).toBeCloseTo(18450);
  });

  it('marks a line with no mined-date price rather than quoting a 0 ISK unit price', () => {
    const formula = rawValueFormula([line(1230, 1000, 0)], 100);
    expect(formula.terms).toEqual([{ typeId: 1230, quantity: 1000, unitPrice: null }]);
    expect(formula.total).toBe(0);
  });

  it('merges repeated lines of one type so each ore is stated once', () => {
    const formula = rawValueFormula([line(1230, 1000, 12500), line(1230, 600, 7500)], 100);
    expect(formula.terms).toEqual([{ typeId: 1230, quantity: 1600, unitPrice: 12.5 }]);
  });
});
