import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { CompareRow } from '@/engine/fittings/fittingCompare';
import {
  fittingCompareCsvColumns,
  fittingCompareModulesCsvColumns,
  type FittingCompareCsvFitting,
} from './fittingCompareCsv';

const t = (k: string, opts?: Record<string, unknown>) =>
  opts ? `${k}(${Object.values(opts).join(',')})` : k;

const fittings: FittingCompareCsvFitting[] = [
  { name: 'Fit A', statsIndex: 0 },
  { name: 'Fit B', statsIndex: 1 },
  { name: 'Fit C', statsIndex: null },
];

function compareRow(key: CompareRow['key'], values: number[]): CompareRow {
  return { key, values, differs: true, bestIndices: [0] };
}

describe('fittingCompareCsvColumns', () => {
  it('heads the stat column and one column per Fitting, by name', () => {
    expect(fittingCompareCsvColumns(t, fittings).map((c) => c.header)).toEqual([
      'fittings.compare.statColumn',
      'Fit A',
      'Fit B',
      'Fit C',
      'fittings.compare.csvBestColumn',
    ]);
  });

  it('exports each Fitting value raw, blank for a Fitting whose stats failed', () => {
    const columns = fittingCompareCsvColumns(t, fittings);
    expect(columns.map((c) => c.value(compareRow('totalDps', [512.3, 498])))).toEqual([
      'fittings.compare.stat.totalDps',
      512.3,
      498,
      null,
      'Fit A',
    ]);
  });

  it('blanks a failed price (NaN) instead of writing NaN', () => {
    const csv = toCsv(
      [compareRow('priceSell', [NaN, 150000000])],
      fittingCompareCsvColumns(t, fittings)
    );
    expect(csv.split('\r\n')[1]).toBe('"fittings.compare.stat.priceSell",,150000000,,"Fit A"');
  });

  it('words the capacitor as the table does — its sign means stable vs depleting', () => {
    const columns = fittingCompareCsvColumns(t, fittings);
    expect(columns.map((c) => c.value(compareRow('capacitor', [42.4, -95])))).toEqual([
      'fittings.compare.stat.capacitor',
      'fittings.compare.stat.capacitorStable(42)',
      'fittings.compare.stat.capacitorUnstable(1m 35s)',
      null,
      'Fit A',
    ]);
  });
});

describe('fittingCompareCsvColumns header facts and best', () => {
  const withFacts: FittingCompareCsvFitting[] = [
    { name: 'Fit A', statsIndex: 0, fits: 'Fits', canFly: 'Can fly' },
    { name: 'Fit B', statsIndex: 1, fits: 'Over by 12 CPU', canFly: null },
    { name: 'Fit C', statsIndex: null },
  ];

  it('exports the Fits and Can fly header facts as rows, one cell per Fitting', () => {
    const columns = fittingCompareCsvColumns(t, withFacts);
    expect(columns.map((c) => c.value({ fact: 'fits' }))).toEqual([
      'fittings.compare.csvFitsRow',
      'Fits',
      'Over by 12 CPU',
      null,
      null,
    ]);
    expect(columns.map((c) => c.value({ fact: 'canFly' }))).toEqual([
      'fittings.compare.csvCanFlyRow',
      'Can fly',
      null,
      null,
      null,
    ]);
  });

  it('names every Fitting tied for best, and leaves the marker blank when nothing differs', () => {
    const best = fittingCompareCsvColumns(t, withFacts).at(-1)!;
    expect(best.value({ ...compareRow('totalDps', [1, 1]), bestIndices: [0, 1] })).toBe(
      'Fit A; Fit B'
    );
    expect(best.value({ ...compareRow('totalDps', [1, 1]), bestIndices: [] })).toBeNull();
  });
});

describe('fittingCompareModulesCsvColumns', () => {
  it('exports the module name and each Fitting count, blank where stats failed', () => {
    const columns = fittingCompareModulesCsvColumns(
      t,
      new Map([[1, 'Warp Disruptor II']]),
      fittings
    );
    expect(columns.map((c) => c.header)).toEqual([
      'fittings.compare.moduleColumn',
      'Fit A',
      'Fit B',
      'Fit C',
    ]);
    expect(columns.map((c) => c.value({ typeId: 1, counts: [2, 0] }))).toEqual([
      'Warp Disruptor II',
      2,
      0,
      null,
    ]);
    expect(columns[0].value({ typeId: 9, counts: [1, 1] })).toBe('common.unknownType(9)');
  });
});
