import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { combinedDayValues, combinedLineDefaults, dayTotalValues } from './combinedValues';

const Z = 45490;
const B = 45492;

function day(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'd',
    characterId: 1,
    date: '2026-10-03',
    solarSystemId: 1,
    payeeId: 'st',
    oreLines: [
      { typeId: Z, quantity: 100 },
      { typeId: B, quantity: 300 },
    ],
    taxPct: 5,
    estimatedValue: 1000,
    taxOwed: 50,
    status: 'paid',
    updatedAt: 0,
    ...overrides,
  };
}

describe('combinedLineDefaults', () => {
  it('uses the per-ore corrections the day already stores', () => {
    const lines = combinedLineDefaults(day({ oreLineValues: { [Z]: 400, [B]: 600 } }), new Map());
    expect(Object.fromEntries(lines)).toEqual({ [Z]: 400, [B]: 600 });
  });

  it('splits the billed value by each line’s market worth, so the lines add up to it', () => {
    const lines = combinedLineDefaults(
      day(),
      new Map([
        [Z, 3],
        [B, 1],
      ])
    );
    // Market worth 300 vs 300: an even split of the 1,000 actually billed.
    expect(lines.get(Z)).toBeCloseTo(500);
    expect(lines.get(B)).toBeCloseTo(500);
  });

  it('falls back to each line’s share of the units when nothing is priced', () => {
    const lines = combinedLineDefaults(day(), new Map());
    expect(lines.get(Z)).toBeCloseTo(250);
    expect(lines.get(B)).toBeCloseTo(750);
  });
});

describe('combinedDayValues', () => {
  const defaults = new Map([
    [Z, 400],
    [B, 600],
  ]);

  it('keeps an untouched day exactly as billed, tax owed included', () => {
    expect(combinedDayValues(day({ taxOwed: 49.6 }), {}, defaults, 5)).toEqual({
      estimatedValue: 1000,
      taxOwed: 49.6,
    });
  });

  it('re-derives an untouched day’s tax only when the rate changed', () => {
    expect(combinedDayValues(day(), {}, defaults, 8).taxOwed).toBeCloseTo(80);
  });

  it('re-totals an edited day from its lines and remembers them', () => {
    expect(combinedDayValues(day(), { [Z]: 1000 }, defaults, 5)).toEqual({
      estimatedValue: 1600,
      taxOwed: 80,
      oreLineValues: { [Z]: 1000, [B]: 600 },
    });
  });
});

describe('dayTotalValues', () => {
  it('bills a typed whole-day value at the rate, with no per-ore corrections', () => {
    expect(dayTotalValues(2000, 5)).toEqual({
      estimatedValue: 2000,
      taxOwed: 100,
    });
  });
});
