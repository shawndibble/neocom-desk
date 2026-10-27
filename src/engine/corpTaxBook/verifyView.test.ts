import { describe, expect, it } from 'vitest';
import {
  dueDate,
  hasRecordOverride,
  ratesUsed,
  verifyRows,
  type VerifyPayloadLine,
} from './verifyView';

const mined: VerifyPayloadLine = {
  kind: 'mined',
  date: '2026-08-13',
  structureId: 7,
  oreLines: [
    { typeId: 45490, quantity: 70_200 },
    { typeId: 45491, quantity: 50_100 },
  ],
  unitPrices: { '45490': 12.5 },
  priceSources: { '45490': 'saved' },
  taxPct: 15,
  rateEffectiveFrom: '2026-08-01',
  estimatedValue: 1_000_000,
  tax: 150_000,
};

describe('verifyRows', () => {
  it('keeps every ore with its quantity, unit price and price source', () => {
    const [row] = verifyRows([mined]);
    expect(row.ores).toEqual([
      { typeId: 45490, quantity: 70_200, unitPrice: 12.5, source: 'saved' },
      { typeId: 45491, quantity: 50_100, unitPrice: undefined, source: undefined },
    ]);
    expect(row).toMatchObject({ date: '2026-08-13', structureId: 7, taxPct: 15, tax: 150_000 });
  });

  it('carries a correction line with its reason and no ore', () => {
    const [row] = verifyRows([
      {
        kind: 'correction',
        date: '2026-08-02',
        oreLines: [],
        estimatedValue: 0,
        tax: -5,
        reason: 'rounding',
      },
    ]);
    expect(row).toMatchObject({ kind: 'correction', ores: [], reason: 'rounding', tax: -5 });
  });
});

describe('dueDate', () => {
  it('is the overdue window after the issue date, in UTC', () => {
    expect(dueDate('2026-09-01T00:00:00.000Z', 14)).toBe('2026-09-15');
    expect(dueDate('2026-09-25T23:59:00.000Z', 14)).toBe('2026-10-09');
  });
});

describe('ratesUsed', () => {
  it('lists each distinct rate and effective date once', () => {
    const rows = verifyRows([
      mined,
      { ...mined, date: '2026-08-14' },
      { ...mined, taxPct: 10, rateEffectiveFrom: '2026-07-01' },
    ]);
    expect(ratesUsed(rows)).toEqual([
      { pct: 15, effectiveFrom: '2026-08-01' },
      { pct: 10, effectiveFrom: '2026-07-01' },
    ]);
  });

  it('flags a per-record override, which has no effective date', () => {
    const rows = verifyRows([{ ...mined, rateEffectiveFrom: undefined }]);
    expect(hasRecordOverride(rows)).toBe(true);
    expect(hasRecordOverride(verifyRows([mined]))).toBe(false);
  });
});
