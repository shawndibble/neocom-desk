import { describe, it, expect } from 'vitest';
import type { BuildPlanRecord } from '@/db';
import { filterAndSortPlans } from './buildPlanSort';

function plan(overrides: Partial<BuildPlanRecord> & { id: string; name: string }): BuildPlanRecord {
  return {
    characterId: 1,
    blueprintTypeID: 1,
    runs: 1,
    me: 0,
    te: 0,
    facility: 'npcStation',
    rigLevel: 'none',
    security: 'highsec',
    hubId: 'jita',
    updatedAt: 0,
    ...overrides,
  };
}

describe('filterAndSortPlans (#409)', () => {
  const PLANS = [
    plan({ id: 'a', name: 'Rifter', updatedAt: 100 }),
    plan({ id: 'b', name: 'Astero', updatedAt: 300 }),
    plan({ id: 'c', name: 'Retriever', updatedAt: 200 }),
  ];

  it('filters by name, case-insensitively', () => {
    expect(filterAndSortPlans(PLANS, 'rift', 'alphabetical').map((p) => p.id)).toEqual(['a']);
    expect(filterAndSortPlans(PLANS, 'RE', 'alphabetical').map((p) => p.id)).toEqual(['c']);
  });

  it('returns every plan for a blank query', () => {
    expect(
      filterAndSortPlans(PLANS, '', 'alphabetical')
        .map((p) => p.id)
        .sort()
    ).toEqual(['a', 'b', 'c']);
  });

  it('sorts alphabetically by name', () => {
    expect(filterAndSortPlans(PLANS, '', 'alphabetical').map((p) => p.name)).toEqual([
      'Astero',
      'Retriever',
      'Rifter',
    ]);
  });

  it('sorts by last updated, most recent first', () => {
    expect(filterAndSortPlans(PLANS, '', 'lastUpdated').map((p) => p.id)).toEqual(['b', 'c', 'a']);
  });
});
