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

const HEADERS = [
  'industry.comparePlanColumn',
  'industry.product',
  'industry.runs',
  'industry.csvTimeSeconds',
  'industry.materialCost',
  'industry.jobFee',
  'industry.totalCost',
  'industry.revenue',
  'industry.profit',
  'industry.csvMarginPct',
  'industry.iskPerHour',
  'industry.breakEvenPrice',
  'industry.compareBuyCost',
  'industry.compareHubOrdersPerDay',
  'industry.compareHubBuyOrders',
  'industry.compareHubSellOrders',
  'industry.compareHubBuyVolume',
  'industry.compareHubSellVolume',
  'industry.csvUnresolvedReason',
];

describe('buildPlanCompareCsvColumns', () => {
  const columns = buildPlanCompareCsvColumns(t);

  it('exports every compare column, whatever the picker shows', () => {
    expect(columns.map((c) => c.header)).toEqual(HEADERS);
  });

  it('exports every figure raw', () => {
    const values = columns.map((c) =>
      c.value(
        row({
          seconds: 3600,
          materialCost: 900_000,
          jobFee: { total: 100_000 },
          totalCost: 1_000_000,
          revenue: 1_250_000.5,
          profit: 250_000.5,
          marginPct: 20,
          iskPerHour: 250_000.5,
          breakEvenPrice: 80_000,
          buyCost: 950_000,
        } as unknown as Partial<BuildResult>)
      )
    );
    expect(values).toEqual([
      'Rifter run',
      'Rifter',
      10,
      3600,
      900_000,
      100_000,
      1_000_000,
      1_250_000.5,
      250_000.5,
      20,
      250_000.5,
      80_000,
      950_000,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('blanks the figures of a row still loading, failed, or unpriceable', () => {
    const unpriced = row({
      seconds: 60,
      jobFee: { total: 1 },
      totalCost: 5,
      profit: null,
      marginPct: null,
      iskPerHour: null,
      breakEvenPrice: null,
    } as unknown as Partial<BuildResult>);
    expect(columns.slice(8, 12).map((c) => c.value(unpriced))).toEqual([null, null, null, null]);
    const failed = row(null, { error: 'boom' });
    expect(columns.slice(3, 13).map((c) => c.value(failed))).toEqual(Array(10).fill(null));
    const loading = row({ seconds: 60, totalCost: 5 }, { loading: true });
    expect(columns[3].value(loading)).toBeNull();
  });
});

describe('buildPlanCompareCsvColumns with hub counts and a reason', () => {
  it('exports the hub counts, orders per day and why a row is unresolved', () => {
    const columns = buildPlanCompareCsvColumns(t, {
      hubCounts: () => ({ buyOrders: 28, sellOrders: 44, buyVolume: 1, sellVolume: 2 }),
      ordersPerDay: () => 9,
      unresolvedReason: () => 'no price',
    });
    const values = columns.map((c) => c.value(row(null, { error: 'boom' })));
    expect(values.slice(13)).toEqual([9, 28, 44, 1, 2, 'no price']);
  });

  it('leaves the reason blank while the row is still loading', () => {
    const columns = buildPlanCompareCsvColumns(t, { unresolvedReason: () => 'no price' });
    expect(columns.at(-1)!.value(row(null, { loading: true }))).toBeNull();
  });
});
