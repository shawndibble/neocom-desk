import { describe, expect, it } from 'vitest';
import { jobsAtMarket, type StockJobInput } from './inJobs';

const MARKET = 60003760;

function job(overrides: Partial<StockJobInput> = {}): StockJobInput {
  return {
    activityId: 1,
    productTypeId: 100,
    runs: 5,
    unitsPerRun: 2,
    outputLocationId: MARKET,
    endDate: '2026-11-20T10:00:00Z',
    ...overrides,
  };
}

describe('jobsAtMarket', () => {
  it('counts runs times units per run for a manufacturing job delivering to the market', () => {
    const { byType, elsewhere } = jobsAtMarket([job()], MARKET, [100]);
    expect(byType.get(100)?.units).toBe(10);
    expect(elsewhere).toBe(0);
  });

  it('counts reaction jobs', () => {
    const { byType } = jobsAtMarket(
      [job({ activityId: 11, runs: 3, unitsPerRun: 200 })],
      MARKET,
      [100]
    );
    expect(byType.get(100)?.units).toBe(600);
  });

  it('does not count copy, invention or research jobs, and does not footnote them', () => {
    for (const activityId of [3, 4, 5, 8]) {
      const { byType, elsewhere } = jobsAtMarket([job({ activityId })], MARKET, [100]);
      expect(byType.get(100)?.units ?? 0).toBe(0);
      expect(elsewhere).toBe(0);
    }
  });

  it('puts a job delivering elsewhere in the footnote, not the count', () => {
    const { byType, elsewhere } = jobsAtMarket(
      [job({ outputLocationId: 1234567890123 }), job({ outputLocationId: undefined })],
      MARKET,
      [100]
    );
    expect(byType.get(100)?.units ?? 0).toBe(0);
    expect(elsewhere).toBe(2);
  });

  it('ignores jobs whose product is not on the list', () => {
    const { byType, elsewhere } = jobsAtMarket(
      [job({ productTypeId: 999, outputLocationId: 5 })],
      MARKET,
      [100]
    );
    expect(byType.size).toBe(0);
    expect(elsewhere).toBe(0);
  });

  it('sums jobs and reports the earliest end', () => {
    const { byType } = jobsAtMarket(
      [job({ endDate: '2026-11-22T00:00:00Z' }), job({ endDate: '2026-11-19T00:00:00Z', runs: 1 })],
      MARKET,
      [100]
    );
    expect(byType.get(100)).toEqual({ units: 12, earliestEnd: '2026-11-19T00:00:00Z' });
  });

  it('cannot size a job with no known units per run, so it counts nothing', () => {
    const { byType, elsewhere } = jobsAtMarket([job({ unitsPerRun: undefined })], MARKET, [100]);
    expect(byType.size).toBe(0);
    expect(elsewhere).toBe(0);
  });
});
