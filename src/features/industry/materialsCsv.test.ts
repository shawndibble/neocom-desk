import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { EffectiveMaterial, HubPrices } from '@/engine/industry/types';
import { materialsCsvColumns } from './materialsCsv';

const t = (k: string) => k;
const nameFor = (typeID: number) => `Item ${typeID}`;

const material = (typeID: number, baseQuantity: number, quantity: number): EffectiveMaterial => ({
  typeID,
  baseQuantity,
  quantity,
});

describe('materialsCsvColumns', () => {
  it('orders columns material, quantity, unit price, line total, using the i18n keys as headers', () => {
    const columns = materialsCsvColumns(t, nameFor, {}, true);
    expect(columns.map((c) => c.header)).toEqual([
      'industry.csvMaterial',
      'industry.csvQuantity',
      'industry.csvUnitPriceIsk',
      'industry.csvLineTotalIsk',
    ]);
  });

  it('emits raw numbers for quantity and price, not formatted/localized strings', () => {
    const hubPrices: HubPrices = { 34: 5.5 };
    const columns = materialsCsvColumns(t, nameFor, hubPrices, true);
    const row = material(34, 1000, 1234567);
    const values = columns.map((c) => c.value(row));
    expect(values[1]).toBe(1234567);
    expect(typeof values[1]).toBe('number');
    expect(values[2]).toBe(5.5);
    expect(typeof values[2]).toBe('number');
  });

  it('computes line total as unitPrice * effective quantity for a priced row', () => {
    const hubPrices: HubPrices = { 34: 5.5 };
    const columns = materialsCsvColumns(t, nameFor, hubPrices, true);
    const row = material(34, 1000, 2000);
    const lineTotal = columns[3].value(row);
    expect(lineTotal).toBe(5.5 * 2000);
  });

  it('emits blank unit price and line total for an unpriced row, never a display string', () => {
    const hubPrices: HubPrices = { 34: 5.5 };
    const columns = materialsCsvColumns(t, nameFor, hubPrices, true);
    const unpricedRow = material(99, 10, 10);
    const csv = toCsv([unpricedRow], columns);
    const dataLine = csv.split('\r\n')[1];
    // "Item 99,10,," — unit price and line total both blank.
    expect(dataLine.endsWith(',,')).toBe(true);
    expect(dataLine).not.toContain('No price');
    expect(dataLine).not.toContain('Unpriced');
    expect(dataLine).not.toContain('Unknown');
  });

  it('blanks every price column when pricesReady is false, even if hubPrices has an entry', () => {
    const hubPrices: HubPrices = { 34: 5.5 };
    const columns = materialsCsvColumns(t, nameFor, hubPrices, false);
    const row = material(34, 1000, 2000);
    expect(columns[2].value(row)).toBeNull();
    expect(columns[3].value(row)).toBeNull();
  });

  it('treats a unit price of 0 as priced, not unpriced', () => {
    const hubPrices: HubPrices = { 34: 0 };
    const columns = materialsCsvColumns(t, nameFor, hubPrices, true);
    const row = material(34, 10, 10);
    expect(columns[2].value(row)).toBe(0);
    expect(columns[3].value(row)).toBe(0);
  });

  it('uses the effective (post-ME) quantity, not the base quantity', () => {
    const columns = materialsCsvColumns(t, nameFor, {}, true);
    const row = material(34, 1000, 950);
    expect(columns[1].value(row)).toBe(950);
  });
});
