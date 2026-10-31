import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { VariationRow } from './useModuleVariations';
import { fittingVariationsCsvColumns } from './fittingVariationsCsv';

const t = (k: string, opts?: Record<string, unknown>) =>
  opts ? `${k}(${Object.values(opts).join(',')})` : k;

function variation(overrides: Partial<VariationRow> = {}): VariationRow {
  return {
    typeId: 1,
    name: 'Small Shield Booster II',
    metaGroupName: 'Tech II',
    delta: [
      { kind: 'stat', change: { key: 'cpuUsed', before: 10, after: 15 } },
      { kind: 'stat', change: { key: 'capacitor', before: 40, after: -120 } },
    ],
    fits: true,
    overage: null,
    canFly: false,
    price: 1250000.5,
    ...overrides,
  };
}

describe('fittingVariationsCsvColumns', () => {
  it('uses the table header keys, in table order', () => {
    expect(fittingVariationsCsvColumns(t).map((c) => c.header)).toEqual([
      'fittings.variations.name',
      'fittings.variations.tier',
      'fittings.variations.changes',
      'fittings.variations.fits',
      'fittings.variations.canFly',
      'fittings.variations.price',
    ]);
  });

  it('exports the stat changes as one cell, the verdicts as words and the price raw', () => {
    expect(fittingVariationsCsvColumns(t).map((c) => c.value(variation()))).toEqual([
      'Small Shield Booster II',
      'Tech II',
      'fittings.variations.stat.cpuUsed(+5); fittings.variations.stat.capacitorUnstable(2m 0s)',
      'fittings.variations.fitsYes',
      'fittings.variations.canFlyNo',
      1250000.5,
    ]);
  });

  it('words a role figure before → after (a remote repairer swap)', () => {
    const row = variation({
      delta: [{ kind: 'role', change: { key: 'remoteRepair', before: 40, after: 32 } }],
    });
    expect(fittingVariationsCsvColumns(t)[2].value(row)).toBe(
      'fittings.whatToTrain.role.remoteRepair(40,32)'
    );
  });

  it('names the overage when the swap does not fit', () => {
    const fits = fittingVariationsCsvColumns(t)[3];
    expect(
      fits.value(variation({ fits: false, overage: { resource: 'cpu', amount: 12.34 } }))
    ).toBe('fittings.variations.stillOverBy(12.3,fittings.list.cpu)');
  });

  it('says no change for an empty delta, and leaves still-loading cells blank', () => {
    const columns = fittingVariationsCsvColumns(t);
    expect(columns[2].value(variation({ delta: [] }))).toBe('fittings.variations.noChanges');
    const loading = variation({ delta: null, fits: null, canFly: null, price: null });
    expect(toCsv([loading], columns).split('\r\n')[1]).toBe(
      '"Small Shield Booster II","Tech II",,,,'
    );
  });
});
