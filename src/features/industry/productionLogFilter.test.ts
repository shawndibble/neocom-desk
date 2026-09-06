import { describe, it, expect } from 'vitest';
import {
  EMPTY_PRODUCTION_LOG_FILTER,
  activeProductionLogFilterCount,
  filterProductionRunsByDate,
} from './productionLogFilter';
import type { ProductionRunRecord } from '@/db';

function run(loggedAt: number, overrides: Partial<ProductionRunRecord> = {}): ProductionRunRecord {
  return {
    id: crypto.randomUUID(),
    characterId: 1,
    buildPlanId: 'plan-1',
    productTypeID: 587,
    quantity: 10,
    materialCost: 500_000,
    jobFee: 50_000,
    totalCost: 550_000,
    loggedAt,
    updatedAt: loggedAt,
    ...overrides,
  };
}

// Local-time constructors, not `Date.parse('...Z')`: the filter derives each
// run's *local* calendar day (see `productionLogFilter.ts`'s
// `localDateString`), so a UTC-anchored fixture would give the wrong answer
// in every timezone except UTC+0 and defeat the point of these tests.
const AUG_10 = new Date(2026, 7, 10, 12, 0, 0).getTime();
const AUG_20 = new Date(2026, 7, 20, 12, 0, 0).getTime();
const AUG_30 = new Date(2026, 7, 30, 12, 0, 0).getTime();

describe('filterProductionRunsByDate', () => {
  it('passes every run through the empty filter', () => {
    const runs = [run(AUG_10), run(AUG_20), run(AUG_30)];
    expect(filterProductionRunsByDate(runs, EMPTY_PRODUCTION_LOG_FILTER)).toHaveLength(3);
  });

  it('excludes runs logged before startDate, keeping the boundary day itself', () => {
    const runs = [run(AUG_10), run(AUG_20), run(AUG_30)];
    const result = filterProductionRunsByDate(runs, { startDate: '2026-08-20', endDate: null });
    expect(result.map((r) => r.loggedAt)).toEqual([AUG_20, AUG_30]);
  });

  it('excludes runs logged after endDate, keeping the boundary day itself', () => {
    const runs = [run(AUG_10), run(AUG_20), run(AUG_30)];
    const result = filterProductionRunsByDate(runs, { startDate: null, endDate: '2026-08-20' });
    expect(result.map((r) => r.loggedAt)).toEqual([AUG_10, AUG_20]);
  });

  it('applies both bounds together as an inclusive range', () => {
    const runs = [run(AUG_10), run(AUG_20), run(AUG_30)];
    const result = filterProductionRunsByDate(runs, {
      startDate: '2026-08-15',
      endDate: '2026-08-25',
    });
    expect(result.map((r) => r.loggedAt)).toEqual([AUG_20]);
  });
});

describe('activeProductionLogFilterCount', () => {
  it('counts zero for the empty filter', () => {
    expect(activeProductionLogFilterCount(EMPTY_PRODUCTION_LOG_FILTER)).toBe(0);
  });

  it('counts each bound that is set', () => {
    expect(activeProductionLogFilterCount({ startDate: '2026-08-01', endDate: null })).toBe(1);
    expect(activeProductionLogFilterCount({ startDate: '2026-08-01', endDate: '2026-08-31' })).toBe(
      2
    );
  });
});
