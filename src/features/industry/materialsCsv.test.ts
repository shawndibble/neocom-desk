import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import { materialCostLines } from '@/engine/industry/sourcing';
import type { HubPrices, MaterialCostLine, MaterialSourcingMap } from '@/engine/industry/types';
import { materialsCsvColumns } from './materialsCsv';

const t = (k: string) => k;
const nameFor = (typeID: number) => `Item ${typeID}`;

/** Built through the engine so the fixtures can never drift from what the panel exports. */
function line(
  typeID: number,
  baseQuantity: number,
  quantity: number,
  hubPrices: HubPrices = {},
  sourcing?: MaterialSourcingMap
): MaterialCostLine {
  return materialCostLines([{ typeID, baseQuantity, quantity }], hubPrices, sourcing)[0];
}

describe('materialsCsvColumns', () => {
  it('orders columns material, quantity, unit price, line total, make or buy, using the i18n keys as headers', () => {
    const columns = materialsCsvColumns(t, nameFor, undefined, true);
    expect(columns.map((c) => c.header)).toEqual([
      'industry.csvMaterial',
      'industry.csvQuantity',
      'industry.csvUnitPriceIsk',
      'industry.csvLineTotalIsk',
      'industry.csvMakeOrBuy',
    ]);
  });

  it('exports the make-or-buy verdict, and a blank where the row has none', () => {
    const advised = line(9840, 12, 12, { 9840: 100 });
    const mineral = line(34, 1000, 1000, { 34: 5 });
    const columns = materialsCsvColumns(
      t,
      nameFor,
      undefined,
      true,
      new Map([
        [
          9840,
          {
            method: 'manufacturing',
            verdict: 'build',
            makeUnitPrice: 20,
            buyUnitPrice: 100,
            savings: 960,
            me: 0,
          } as const,
        ],
      ])
    );
    const verdict = columns[4];
    expect(verdict.value(advised)).toBe('industry.makeOrBuy.build');
    expect(verdict.value(mineral)).toBeNull();
  });

  it('emits raw numbers for quantity and price, not formatted/localized strings', () => {
    const columns = materialsCsvColumns(t, nameFor, undefined, true);
    const values = columns.map((c) => c.value(line(34, 1000, 1234567, { 34: 5.5 })));
    expect(values[1]).toBe(1234567);
    expect(typeof values[1]).toBe('number');
    expect(values[2]).toBe(5.5);
    expect(typeof values[2]).toBe('number');
  });

  it('computes line total as unitPrice * effective quantity for a priced row', () => {
    const columns = materialsCsvColumns(t, nameFor, undefined, true);
    expect(columns[3].value(line(34, 1000, 2000, { 34: 5.5 }))).toBe(5.5 * 2000);
  });

  it('emits blank unit price and line total for an unpriced row, never a display string', () => {
    const columns = materialsCsvColumns(t, nameFor, undefined, true);
    const csv = toCsv([line(99, 10, 10, { 34: 5.5 })], columns);
    const dataLine = csv.split('\r\n')[1];
    // "Item 99,10,," — unit price and line total both blank.
    expect(dataLine.endsWith(',,')).toBe(true);
    expect(dataLine).not.toContain('No price');
    expect(dataLine).not.toContain('Unpriced');
    expect(dataLine).not.toContain('Unknown');
  });

  it('blanks every price column when pricesReady is false, even if a hub price exists', () => {
    const columns = materialsCsvColumns(t, nameFor, undefined, false);
    const row = line(34, 1000, 2000, { 34: 5.5 });
    expect(columns[2].value(row)).toBeNull();
    expect(columns[3].value(row)).toBeNull();
  });

  it('still exports an override price when pricesReady is false — it needs no market data', () => {
    const sourcing: MaterialSourcingMap = { 34: { overridePrice: 7 } };
    const columns = materialsCsvColumns(t, nameFor, sourcing, false);
    const row = line(34, 1000, 1000, { 34: 5.5 }, sourcing);
    expect(columns[2].value(row)).toBe(7);
    expect(columns[3].value(row)).toBe(7000);
  });

  it('treats a unit price of 0 as priced, not unpriced', () => {
    const columns = materialsCsvColumns(t, nameFor, undefined, true);
    const row = line(34, 10, 10, { 34: 0 });
    expect(columns[2].value(row)).toBe(0);
    expect(columns[3].value(row)).toBe(0);
  });

  it('uses the effective (post-ME) quantity, not the base quantity', () => {
    const columns = materialsCsvColumns(t, nameFor, undefined, true);
    expect(columns[1].value(line(34, 1000, 950))).toBe(950);
  });

  it('exports the override price and the owned-adjusted line total, matching the table', () => {
    const sourcing: MaterialSourcingMap = { 34: { ownedQuantity: 400, overridePrice: 7 } };
    const columns = materialsCsvColumns(t, nameFor, sourcing, true);
    const row = line(34, 1000, 1000, { 34: 5 }, sourcing);
    expect(columns[2].value(row)).toBe(7);
    expect(columns[3].value(row)).toBe(600 * 7);
  });

  it('exports a real zero for a fully owned row even with no price at all', () => {
    const sourcing: MaterialSourcingMap = { 34: { ownedQuantity: 1000 } };
    const columns = materialsCsvColumns(t, nameFor, sourcing, true);
    const row = line(34, 1000, 1000, {}, sourcing);
    expect(columns[2].value(row)).toBeNull();
    expect(columns[3].value(row)).toBe(0);
  });
});
