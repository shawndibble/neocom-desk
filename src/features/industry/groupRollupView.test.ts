import { describe, expect, it } from 'vitest';
import type { BuildPlanRecord } from '@/db';
import type { BuildResult } from '@/engine/industry/types';
import type { BuildGroup } from './buildGroups';
import { computeGroupIndexStats } from './groupIndexStats';
import { computeGroupRollup } from './groupRollupView';
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
    profit: -10,
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

const byId = (...rows: ComparedBuildRow[]) => new Map(rows.map((r) => [r.planId, r]));

describe('computeGroupRollup', () => {
  it('is complete with a verdict and totals when every member is priced', () => {
    const view = computeGroupRollup(GROUP, [plan('a'), plan('b')], byId(row('a'), row('b')));
    expect(view.complete).toBe(true);
    expect(view.members.map((m) => m.planId)).toEqual(['a', 'b']);
    expect(view.verdict).toBe('build');
    expect(view.profit).toBe(-20);
    expect(view.savings).toBe(view.rollup.buyCost! - view.rollup.totalCost);
    expect(view.buildCost).toBe(view.rollup.totalCost);
    expect(view.buyCost).toBe(view.rollup.buyCost);
  });

  it('reads unknown while a member has no row, keeping the settled members listed', () => {
    const view = computeGroupRollup(GROUP, [plan('a'), plan('b')], byId(row('a')));
    expect(view.complete).toBe(false);
    expect(view.members.map((m) => m.planId)).toEqual(['a']);
    expect(view.verdict).toBe('unknown');
    expect(view.savings).toBeNull();
    expect(view.profit).toBeNull();
    expect(view.buildCost).toBeNull();
    expect(view.buyCost).toBeNull();
  });

  it('reads unknown while a member has no settled groupResult', () => {
    const view = computeGroupRollup(
      GROUP,
      [plan('a'), plan('b')],
      byId(row('a'), row('b', { loading: true, groupResult: undefined }))
    );
    expect(view.verdict).toBe('unknown');
    expect(view.profit).toBeNull();
  });

  it('reads unknown for an empty group', () => {
    const view = computeGroupRollup(GROUP, [], new Map());
    expect(view.complete).toBe(false);
    expect(view.verdict).toBe('unknown');
  });

  it('reads unknown when a member is unpriceable, but keeps a signed saving', () => {
    const view = computeGroupRollup(
      GROUP,
      [plan('a')],
      byId(row('a', { groupResult: result({ unpriceable: true }) }))
    );
    expect(view.verdict).toBe('unknown');
    expect(view.savings).not.toBeNull();
    expect(view.buildCost).toBeNull();
  });

  it('reads unknown when a member profit is null even though nothing is flagged unpriceable', () => {
    const view = computeGroupRollup(
      GROUP,
      [plan('a')],
      byId(row('a', { groupResult: result({ profit: null }) }))
    );
    expect(view.verdict).toBe('unknown');
    expect(view.buildCost).toBeNull();
  });

  it('gives the list and the page the same verdict', () => {
    const plans = [plan('a'), plan('b')];
    for (const rows of [byId(row('a'), row('b')), byId(row('a'))]) {
      expect(computeGroupIndexStats(GROUP, plans, rows).verdict).toBe(
        computeGroupRollup(GROUP, plans, rows).verdict
      );
    }
  });
});
