import { describe, expect, it } from 'vitest';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult } from '@/engine/industry/types';
import type { BuildGroup } from './buildGroups';
import { computeGroupIndexStats, verdictOf } from './groupIndexStats';
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

describe('verdictOf', () => {
  it('is "build" when the total is at or below the buy price', () => {
    expect(verdictOf(100, 200)).toBe('build');
    expect(verdictOf(200, 200)).toBe('build');
  });

  it('is "buy" when the total is above the buy price', () => {
    expect(verdictOf(201, 200)).toBe('buy');
  });

  it('is "unknown" whenever there is no buy price to compare against', () => {
    expect(verdictOf(100, null)).toBe('unknown');
  });
});

describe('computeGroupIndexStats', () => {
  it("sums every member's own rollup into one totalCost/verdict", () => {
    const plans = [plan('p1'), plan('p2')];
    const jobFee = { eiv: 0, grossCost: 0, sccSurcharge: 0, facilityTax: 0, total: 5 };
    const rows = new Map([
      ['p1', row('p1', { groupResult: result({ materialCost: 100, jobFee, buyCost: 200 }) })],
      ['p2', row('p2', { groupResult: result({ materialCost: 50, jobFee, buyCost: 100 }) })],
    ]);

    const stats = computeGroupIndexStats(GROUP, plans, rows);

    // totalCost = (100+5) + (50+5) = 160; buyCost = 200 + 100 = 300 -> build
    expect(stats.totalCost).toBe(160);
    expect(stats.verdict).toBe('build');
  });

  it('reads "unknown" when a member has not settled a groupResult yet', () => {
    const plans = [plan('p1'), plan('p2')];
    const rows = new Map([
      ['p1', row('p1')],
      ['p2', row('p2', { groupResult: null, loading: true })],
    ]);

    const stats = computeGroupIndexStats(GROUP, plans, rows);

    expect(stats).toEqual({ totalCost: null, verdict: 'unknown' });
  });

  it('reads "unknown" for an empty group rather than a zero total', () => {
    const stats = computeGroupIndexStats(GROUP, [], new Map());
    expect(stats).toEqual({ totalCost: null, verdict: 'unknown' });
  });
});
