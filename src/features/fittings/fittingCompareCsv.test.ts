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
    ]);
  });

  it('exports each Fitting value raw, blank for a Fitting whose stats failed', () => {
    const columns = fittingCompareCsvColumns(t, fittings);
    expect(columns.map((c) => c.value(compareRow('totalDps', [512.3, 498])))).toEqual([
      'fittings.compare.stat.totalDps',
      512.3,
      498,
      null,
    ]);
  });

  it('blanks a failed price (NaN) instead of writing NaN', () => {
    const csv = toCsv(
      [compareRow('priceSell', [NaN, 150000000])],
      fittingCompareCsvColumns(t, fittings)
    );
    expect(csv.split('\r\n')[1]).toBe('"fittings.compare.stat.priceSell",,150000000,');
  });

  it('words the capacitor as the table does — its sign means stable vs depleting', () => {
    const columns = fittingCompareCsvColumns(t, fittings);
    expect(columns.map((c) => c.value(compareRow('capacitor', [42.4, -95])))).toEqual([
      'fittings.compare.stat.capacitor',
      'fittings.compare.stat.capacitorStable(42)',
      'fittings.compare.stat.capacitorUnstable(1m 35s)',
      null,
    ]);
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
