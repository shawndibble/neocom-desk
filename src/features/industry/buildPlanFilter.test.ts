import { describe, expect, it } from 'vitest';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import {
  BUILD_PLAN_FILTER,
  DEFAULT_BUILD_PLAN_FILTER,
  activePlanFilterCount,
  filterPlans,
  type BuildPlanFilterState,
} from './buildPlanFilter';
import type { PlanIndexStats } from './BuildPlanList';

const plan = (id: string, over: Partial<BuildPlanRecord> = {}) =>
  ({ id, blueprintTypeID: Number(id), ...over }) as BuildPlanRecord;
const bp = (type_id: number, runs: number) => ({ type_id, runs }) as CharacterBlueprint;
const stats = (over: Partial<PlanIndexStats> = {}): PlanIndexStats => ({
  profit: 100,
  verdict: 'build',
  runs: 1,
  ...over,
});

const plans = [plan('1'), plan('2'), plan('3'), plan('4', { buildGroupId: 'g1' })];
const base = {
  owned: [bp(1, -1), bp(2, 50)],
  activityOf: (p: BuildPlanRecord) => (p.id === '3' ? 'reaction' : 'manufacturing') as never,
  statsByPlanId: new Map([
    ['1', stats()],
    ['2', stats({ profit: -5, verdict: 'buy' })],
    ['3', stats({ profit: null, verdict: 'unknown' })],
    ['4', stats({ verdict: 'fixLocation' })],
  ]),
};
const run = (over: Partial<BuildPlanFilterState>) =>
  filterPlans(plans, { ...DEFAULT_BUILD_PLAN_FILTER, ...over }, base).map((p) => p.id);

describe('filterPlans', () => {
  it('keeps everything by default', () => {
    expect(run({})).toEqual(['1', '2', '3', '4']);
    expect(activePlanFilterCount(DEFAULT_BUILD_PLAN_FILTER)).toBe(0);
  });
  it('filters by blueprint ownership', () => {
    expect(run({ ownership: 'owned' })).toEqual(['1', '2']);
    expect(run({ ownership: 'bpo' })).toEqual(['1']);
    expect(run({ ownership: 'bpc' })).toEqual(['2']);
    expect(run({ ownership: 'none' })).toEqual(['3', '4']);
  });
  it('treats a BPO plus a BPC of one blueprint as both', () => {
    const both = { ...base, owned: [bp(1, -1), bp(1, 10)] };
    const f = (ownership: BuildPlanFilterState['ownership']) =>
      filterPlans(plans, { ...DEFAULT_BUILD_PLAN_FILTER, ownership }, both).map((p) => p.id);
    expect(f('bpo')).toEqual(['1']);
    expect(f('bpc')).toEqual(['1']);
  });
  it('filters by verdict', () => {
    expect(run({ verdicts: new Set(['build']) })).toEqual(['1']);
    expect(run({ verdicts: new Set(['unknown', 'fixLocation']) })).toEqual(['3', '4']);
  });
  it('profitable only hides losses, unpriced and fix-location plans', () => {
    expect(run({ profitableOnly: true })).toEqual(['1']);
  });
  it('filters by activity and group', () => {
    expect(run({ activity: 'reaction' })).toEqual(['3']);
    expect(run({ group: 'g1' })).toEqual(['4']);
    expect(run({ group: 'none' })).toEqual(['1', '2', '3']);
  });
  it('ignores a dangling group id like the list does', () => {
    const dangling = [plan('9', { buildGroupId: 'gone' })];
    const out = filterPlans(
      dangling,
      { ...DEFAULT_BUILD_PLAN_FILTER, group: 'none' },
      { ...base, knownGroupIds: new Set(['g1']) }
    );
    expect(out).toHaveLength(1);
  });
});

describe('URL codec', () => {
  it('round-trips defaults to absent params', () => {
    for (const [field, key] of Object.entries(BUILD_PLAN_FILTER.fieldToParam)) {
      const codec = BUILD_PLAN_FILTER.schema[key]!;
      const v = (DEFAULT_BUILD_PLAN_FILTER as unknown as Record<string, unknown>)[field];
      expect(codec.serialize(v as never)).toBeNull();
    }
  });
  it('counts each non-default field once', () => {
    expect(
      activePlanFilterCount({
        ...DEFAULT_BUILD_PLAN_FILTER,
        ownership: 'bpo',
        profitableOnly: true,
        verdicts: new Set(['build']),
      })
    ).toBe(3);
  });
});
