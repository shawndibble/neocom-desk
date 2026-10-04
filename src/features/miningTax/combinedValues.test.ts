import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord } from '@/db';
import { combinedLineDefaults } from './combinedValues';

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
