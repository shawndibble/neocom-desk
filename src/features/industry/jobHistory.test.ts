import { describe, it, expect } from 'vitest';
import type { IndustryJob } from '@/esi/endpoints';
import {
  isDeliveredJob,
  isOpenJob,
  mergeJobHistory,
  classifyHistoryJobs,
  countUnloggedDeliveries,
  type LoggedRunRef,
} from './jobHistory';

function job(overrides: Partial<IndustryJob> = {}): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 638,
    facility_id: 1,
    station_id: 1,
    runs: 1,
    start_date: '2026-08-29T10:00:00Z',
    end_date: '2026-08-29T12:00:00Z',
    status: 'delivered',
    product_type_id: 587,
    ...overrides,
  };
}

function run(overrides: Partial<LoggedRunRef> = {}): LoggedRunRef {
  return {
    id: 'r1',
    characterId: 7,
    buildPlanId: 'plan-1',
    productTypeID: 587,
    loggedAt: Date.parse('2026-08-30T00:00:00Z'),
    ...overrides,
  };
}

describe('status helpers', () => {
  it('delivered is history; active/paused/ready stay open; cancelled/reverted are neither', () => {
    expect(isDeliveredJob(job({ status: 'delivered' }))).toBe(true);
    expect(isDeliveredJob(job({ status: 'ready' }))).toBe(false);
    for (const status of ['active', 'paused', 'ready'] as const) {
      expect(isOpenJob(job({ status }))).toBe(true);
    }
    for (const status of ['delivered', 'cancelled', 'reverted'] as const) {
      expect(isOpenJob(job({ status }))).toBe(false);
    }
  });
});

describe('mergeJobHistory', () => {
  it('keeps stored delivered jobs ESI no longer returns', () => {
    const merged = mergeJobHistory([job({ job_id: 1 })], [job({ job_id: 2 })]);
    expect(merged.map((j) => j.job_id).sort()).toEqual([1, 2]);
  });

  it('dedupes by job_id, the fetched copy winning', () => {
    const merged = mergeJobHistory([job({ job_id: 1, runs: 1 })], [job({ job_id: 1, runs: 5 })]);
    expect(merged).toHaveLength(1);
    expect(merged[0].runs).toBe(5);
  });

  it('stores only delivered jobs from the fetch', () => {
    const merged = mergeJobHistory(
      [],
      [
        job({ job_id: 1, status: 'active' }),
        job({ job_id: 2, status: 'ready' }),
        job({ job_id: 3, status: 'cancelled' }),
        job({ job_id: 4, status: 'reverted' }),
        job({ job_id: 5, status: 'delivered' }),
      ]
    );
    expect(merged.map((j) => j.job_id)).toEqual([5]);
  });

  it('drops a stored job a later fetch reports as reverted or cancelled', () => {
    const merged = mergeJobHistory([job({ job_id: 1 })], [job({ job_id: 1, status: 'reverted' })]);
    expect(merged).toEqual([]);
  });

  it('orders newest end_date first', () => {
    const merged = mergeJobHistory(
      [job({ job_id: 1, end_date: '2026-08-01T00:00:00Z' })],
      [job({ job_id: 2, end_date: '2026-09-01T00:00:00Z' })]
    );
    expect(merged.map((j) => j.job_id)).toEqual([2, 1]);
  });
});

describe('classifyHistoryJobs', () => {
  const jobs = [
    { ...job({ job_id: 10, end_date: '2026-08-29T12:00:00Z' }), characterId: 7 },
    { ...job({ job_id: 11, end_date: '2026-08-29T13:00:00Z' }), characterId: 7 },
  ];

  it('marks a job logged when a run carries its id', () => {
    const states = classifyHistoryJobs(jobs, [run({ id: 'a', sourceJobId: 11 })]);
    expect(states.get(11)).toEqual({ kind: 'logged', buildPlanId: 'plan-1', runId: 'a' });
    expect(states.get(10)).toEqual({ kind: 'unlogged' });
  });

  it('falls back to character + product + loggedAt after the job ended, each run used once', () => {
    const states = classifyHistoryJobs(jobs, [run({ id: 'a' })]);
    // oldest job claims the single run
    expect(states.get(10)?.kind).toBe('logged');
    expect(states.get(11)?.kind).toBe('unlogged');
  });

  it('does not let the fallback steal a run an exact link already claims', () => {
    const states = classifyHistoryJobs(jobs, [run({ id: 'a', sourceJobId: 11 })]);
    expect(states.get(10)?.kind).toBe('unlogged');
  });

  it('ignores a run logged before the job ended', () => {
    const states = classifyHistoryJobs(jobs, [
      run({ id: 'a', loggedAt: Date.parse('2026-08-29T11:00:00Z') }),
    ]);
    expect(states.get(10)?.kind).toBe('unlogged');
  });

  it('ignores another character or another product', () => {
    const states = classifyHistoryJobs(jobs, [
      run({ id: 'a', characterId: 8 }),
      run({ id: 'b', productTypeID: 1 }),
    ]);
    expect(states.get(10)?.kind).toBe('unlogged');
  });

  it('treats a job with no product (research/copy) as unlogged-nothing: never claims a run', () => {
    const states = classifyHistoryJobs(
      [{ ...job({ job_id: 12, product_type_id: undefined }), characterId: 7 }],
      [run()]
    );
    expect(states.get(12)?.kind).toBe('unlogged');
  });
});

describe('countUnloggedDeliveries', () => {
  it('counts only loggable (manufacturing/reaction with a product) unlogged jobs', () => {
    const rows = [
      { ...job({ job_id: 1 }), characterId: 7 },
      { ...job({ job_id: 2, activity_id: 5, product_type_id: 9 }), characterId: 7 },
      { ...job({ job_id: 3, product_type_id: undefined }), characterId: 7 },
      { ...job({ job_id: 4 }), characterId: 7 },
    ];
    const states = classifyHistoryJobs(rows, [run({ sourceJobId: 4 })]);
    expect(countUnloggedDeliveries(rows, states)).toBe(1);
  });

  it('can be narrowed to one blueprint', () => {
    const rows = [
      { ...job({ job_id: 1, blueprint_type_id: 1 }), characterId: 7 },
      { ...job({ job_id: 2, blueprint_type_id: 2 }), characterId: 7 },
    ];
    const states = classifyHistoryJobs(rows, []);
    expect(countUnloggedDeliveries(rows, states, { blueprintTypeId: 2 })).toBe(1);
  });

  it('leaves out dismissed jobs, but a dismissed job that got logged is just logged', () => {
    const rows = [
      { ...job({ job_id: 1 }), characterId: 7 },
      { ...job({ job_id: 2 }), characterId: 7 },
      { ...job({ job_id: 3 }), characterId: 7 },
    ];
    const states = classifyHistoryJobs(rows, [run({ sourceJobId: 3 })]);
    expect(countUnloggedDeliveries(rows, states, { dismissedJobIds: new Set([2, 3]) })).toBe(1);
  });
});
