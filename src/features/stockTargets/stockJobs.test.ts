import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { readCachedStockJobs } from './stockJobs';

vi.mock('@/features/industry/blueprintCatalog', () => ({
  loadBlueprintCatalog: async () => ({
    byBlueprintTypeID: new Map([
      [500, { blueprint: { products: [{ typeID: 100, quantity: 3 }] } }],
    ]),
  }),
}));

const job = (over: Record<string, unknown>) => ({
  job_id: 1,
  activity_id: 1,
  blueprint_type_id: 500,
  product_type_id: 100,
  facility_id: 1,
  station_id: 1,
  output_location_id: 60003760,
  runs: 4,
  start_date: '2026-11-18T00:00:00Z',
  end_date: '2026-11-19T00:00:00Z',
  status: 'active',
  ...over,
});

describe('readCachedStockJobs', () => {
  beforeEach(async () => {
    await db.esiCache.clear();
  });

  it('adapts cached active jobs with units per run from the blueprint', async () => {
    await db.esiCache.put({
      characterId: 1,
      key: 'industryJobs',
      value: [
        job({}),
        job({ job_id: 2, status: 'delivered' }),
        job({ job_id: 3, status: 'ready', runs: 1 }),
      ],
      fetchedAt: 5,
    });
    const read = await readCachedStockJobs([1]);
    expect(read.jobs.map((j) => j.runs)).toEqual([4, 1]);
    expect(read.jobs[0]).toEqual({
      activityId: 1,
      productTypeId: 100,
      runs: 4,
      unitsPerRun: 3,
      outputLocationId: 60003760,
      endDate: '2026-11-19T00:00:00Z',
    });
    expect(read.oldestFetchedAt?.getTime()).toBe(5);
  });

  it('reads nothing when no jobs are cached', async () => {
    expect(await readCachedStockJobs([1])).toEqual({ jobs: [], oldestFetchedAt: null });
  });
});
