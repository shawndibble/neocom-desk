import { describe, expect, it } from 'vitest';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult } from '@/engine/industry/types';
import type { BuildGroup } from './buildGroups';
import { computeGroupIndexStats, profitOf, verdictOf } from './groupIndexStats';
import type { ComparedBuildRow } from './useComparedBuildResults';

const GROUP: BuildGroup = { id: 'g1', name: 'Fit', order: 0 };

function plan(id: string): BuildPlanRecord {
  return {
    id,
    characterId: 1,
    name: id,
    blueprintTypeID: 1,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 1,
    buildGroupId: GROUP.id,
  };
}

function result(over: Partial<BuildResult> = {}): BuildResult {
  return {
    materials: [],
    seconds: 100,
    jobFee: { eiv: 0, grossCost: 0, sccSurcharge: 0, facilityTax: 0, total: 5 },
    materialCost: 100,
    totalCost: 105,
    buyCost: 200,
    revenue: null,
    salesTax: null,
    brokerFee: null,
    netRevenue: null,
    profit: null,
    marginPct: null,
    iskPerHour: null,
    grossProfit: null,
    grossMargin: null,
    grossIskPerHour: null,
    breakEvenPrice: null,
    unpricedMaterials: [],
    unpriceable: false,
    recommendation: 'build',
    ...over,
  } as BuildResult;
}

function row(planId: string, over: Partial<ComparedBuildRow> = {}): ComparedBuildRow {
  return {
    planId,
    planName: planId,
    productName: planId,
    runs: 1,
    loading: false,
    result: result(),
    groupResult: result(),
    error: null,
    ...over,
  };
}

describe('profitOf', () => {
  it('is buy price minus build cost', () => {
    expect(profitOf(100, 200)).toBe(100);
    expect(profitOf(201, 200)).toBe(-1);
  });

  it('is null with no buy price to compare against', () => {
    expect(profitOf(100, null)).toBeNull();
  });
});

describe('verdictOf', () => {
  it('is "build" for a zero or positive profit', () => {
    expect(verdictOf(100)).toBe('build');
    expect(verdictOf(0)).toBe('build');
  });

  it('is "buy" for a negative profit', () => {
    expect(verdictOf(-1)).toBe('buy');
  });

  it('is "unknown" for a null profit', () => {
    expect(verdictOf(null)).toBe('unknown');
  });

  it('is "unknown" when unpriceable, even with a non-null profit', () => {
    // A `savings` figure can stay non-null (an unpriced material's line
    // costs 0) while the group can't really be priced — `unpriceable` must
    // override a confident-looking sign.
    expect(verdictOf(100, true)).toBe('unknown');
    expect(verdictOf(-1, true)).toBe('unknown');
  });
});

describe('computeGroupIndexStats', () => {
  it('sums every member’s own profit after fees, independent of the buy-vs-build verdict', () => {
    const plans = [plan('p1'), plan('p2')];
    const jobFee = { eiv: 0, grossCost: 0, sccSurcharge: 0, facilityTax: 0, total: 5 };
    const rows = new Map([
      [
        'p1',
        row('p1', {
          groupResult: result({ materialCost: 100, jobFee, buyCost: 200, profit: -10 }),
        }),
      ],
      [
        'p2',
        row('p2', { groupResult: result({ materialCost: 50, jobFee, buyCost: 100, profit: -5 }) }),
      ],
    ]);

    const stats = computeGroupIndexStats(GROUP, plans, rows);

    // profit is the sum of each member's own profit after fees: -10 + -5 = -15.
    expect(stats.profit).toBe(-15);
    // verdict stays keyed off buy-vs-build savings (totalCost 160 vs buyCost
    // 300), not the profit above — the two are deliberately independent.
    expect(stats.verdict).toBe('build');
  });

  it('reads "unknown" when a member has not settled a groupResult yet', () => {
    const plans = [plan('p1'), plan('p2')];
    const rows = new Map([
      ['p1', row('p1')],
      ['p2', row('p2', { groupResult: null, loading: true })],
    ]);

    const stats = computeGroupIndexStats(GROUP, plans, rows);

    expect(stats).toEqual({ profit: null, verdict: 'unknown' });
  });

  it('reads "unknown" for an empty group rather than a zero total', () => {
    const stats = computeGroupIndexStats(GROUP, [], new Map());
    expect(stats).toEqual({ profit: null, verdict: 'unknown' });
  });

  it('reads "unknown" verdict when a member is unpriceable, even though buyCost/totalCost still yield a signed savings', () => {
    // An unpriced material's own line costs 0 (see materialResolution.ts),
    // so `totalCost`/`buyCost` can still produce a confident-looking
    // `savings` sign here — `unpriceable: true` must still win.
    const plans = [plan('p1')];
    const rows = new Map([
      ['p1', row('p1', { groupResult: result({ buyCost: 200, unpriceable: true }) })],
    ]);

    const stats = computeGroupIndexStats(GROUP, plans, rows);

    expect(stats.verdict).toBe('unknown');
  });
});
