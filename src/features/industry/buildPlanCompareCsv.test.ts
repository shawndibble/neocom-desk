import { describe, expect, it } from 'vitest';
import type { BuildResult } from '@/engine/industry/types';
import { buildPlanCompareCsvColumns } from './buildPlanCompareCsv';
import type { ComparedBuildRow } from './useComparedBuildResults';

const t = (k: string) => k;

function row(result: Partial<BuildResult> | null, extra: Partial<ComparedBuildRow> = {}) {
  return {
    planId: 'p1',
    planName: 'Rifter run',
    productName: 'Rifter',
    runs: 10,
    loading: false,
    result: result as BuildResult | null,
    groupResult: null,
    error: null,
    ...extra,
  } satisfies ComparedBuildRow;
}

describe('buildPlanCompareCsvColumns', () => {
  const columns = buildPlanCompareCsvColumns(t);

  it('orders columns as the compare table does', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'industry.comparePlanColumn',
      'industry.product',
      'industry.runs',
      'industry.csvTimeSeconds',
      'industry.totalCost',
      'industry.profit',
      'industry.csvMarginPct',
      'industry.iskPerHour',
      'industry.breakEvenPrice',
    ]);
  });

  it('exports every figure raw', () => {
    const values = columns.map((c) =>
      c.value(
        row({
          seconds: 3600,
          totalCost: 1_000_000,
          profit: 250_000.5,
          marginPct: 20,
          iskPerHour: 250_000.5,
          breakEvenPrice: 80_000,
        })
      )
    );
    expect(values).toEqual([
      'Rifter run',
      'Rifter',
      10,
      3600,
      1_000_000,
      250_000.5,
      20,
      250_000.5,
      80_000,
    ]);
  });

  it('blanks the figures of a row still loading, failed, or unpriceable', () => {
    const unpriced = row({
      seconds: 60,
      totalCost: 5,
      profit: null,
      marginPct: null,
      iskPerHour: null,
      breakEvenPrice: null,
    });
    expect(columns.slice(5).map((c) => c.value(unpriced))).toEqual([null, null, null, null]);
    const failed = row(null, { error: 'boom' });
    expect(columns.slice(3).map((c) => c.value(failed))).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    const loading = row({ seconds: 60, totalCost: 5 }, { loading: true });
    expect(columns[3].value(loading)).toBeNull();
  });
});
