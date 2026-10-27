import { describe, it, expect } from 'vitest';
import type { CertifiedPlan } from '@/sde/types';
import {
  certifiedPlanRecord,
  groupByCareerPath,
  isPlanCompleted,
  untrainedEntries,
} from './certifiedPlan';

const NAMES: Record<number, string> = {
  3380: 'Industry',
  3387: 'Mass Production',
  3327: 'Spaceship Command',
};
const nameFor = (id: number) => NAMES[id] ?? `Skill ${id}`;

function plan(overrides: Partial<CertifiedPlan> = {}): CertifiedPlan {
  return {
    id: 14,
    name: 'Manufacturer',
    description: 'Builds things.',
    careerPathId: 5,
    entries: [
      { skillTypeID: 3380, level: 1 },
      { skillTypeID: 3327, level: 1 },
      { skillTypeID: 3380, level: 2 },
      { skillTypeID: 3387, level: 1 },
    ],
    milestones: [
      { skillTypeID: 3380, level: 2 },
      { skillTypeID: 3387, level: 1 },
    ],
    ...overrides,
  };
}

describe('certifiedPlanRecord', () => {
  it("is a new plan named after the certified plan, holding its levels in CCP's order", () => {
    const record = certifiedPlanRecord(90000001, plan(), nameFor, 2);
    expect(record.characterId).toBe(90000001);
    expect(record.name).toBe('Manufacturer');
    expect(record.remapCount).toBe(2);
    expect(record.entries).toEqual([
      { skillTypeID: 3380, targetLevel: 1 },
      { skillTypeID: 3327, targetLevel: 1 },
      { skillTypeID: 3380, targetLevel: 2 },
      { skillTypeID: 3387, targetLevel: 1 },
    ]);
  });

  it("turns CCP's milestones into Plan Milestones named after the skill level", () => {
    const record = certifiedPlanRecord(1, plan(), nameFor, 0);
    expect(
      record.milestones?.map(({ name, skillTypeID, level }) => ({ name, skillTypeID, level }))
    ).toEqual([
      { name: 'Industry II', skillTypeID: 3380, level: 2 },
      { name: 'Mass Production I', skillTypeID: 3387, level: 1 },
    ]);
    const ids = record.milestones?.map((m) => m.id) ?? [];
    expect(new Set(ids).size).toBe(2);
  });

  it('omits the milestones key when the plan has none', () => {
    const record = certifiedPlanRecord(1, plan({ milestones: [] }), nameFor, 0);
    expect('milestones' in record).toBe(false);
  });

  it('collapses a repeated level to one row, as any other import does', () => {
    const record = certifiedPlanRecord(
      1,
      plan({
        entries: [
          { skillTypeID: 3380, level: 2 },
          { skillTypeID: 3380, level: 1 },
        ],
        milestones: [],
      }),
      nameFor,
      0
    );
    expect(record.entries).toEqual([{ skillTypeID: 3380, targetLevel: 2 }]);
  });
});

describe('groupByCareerPath', () => {
  it("groups plans by career path in id order, keeping each group's order", () => {
    const groups = groupByCareerPath([
      plan({ id: 1, careerPathId: 6, name: 'Bounty Hunter' }),
      plan({ id: 2, careerPathId: 4, name: 'Treasure Hunter' }),
      plan({ id: 3, careerPathId: 6, name: 'Mission Runner' }),
    ]);
    expect(groups.map((g) => [g.careerPathId, g.plans.map((p) => p.id)])).toEqual([
      [4, [2]],
      [6, [1, 3]],
    ]);
  });
});

describe('trained levels', () => {
  const trained = (levels: Record<number, number>) =>
    new Map(Object.entries(levels).map(([id, level]) => [Number(id), { level, sp: 0 }]));

  it('keeps only the levels not trained yet', () => {
    expect(untrainedEntries(plan(), trained({ 3380: 1, 3327: 1 }))).toEqual([
      { skillTypeID: 3380, level: 2 },
      { skillTypeID: 3387, level: 1 },
    ]);
  });

  it('is completed only when every level is trained', () => {
    expect(isPlanCompleted(plan(), trained({ 3380: 2, 3327: 1, 3387: 1 }))).toBe(true);
    expect(isPlanCompleted(plan(), trained({ 3380: 2, 3327: 1 }))).toBe(false);
    expect(isPlanCompleted(plan(), new Map())).toBe(false);
  });

  it('builds a record of the untrained levels and unreached milestones', () => {
    const record = certifiedPlanRecord(1, plan(), nameFor, 0, trained({ 3380: 2, 3327: 1 }));
    expect(record.entries).toEqual([{ skillTypeID: 3387, targetLevel: 1 }]);
    expect(record.milestones?.map((m) => m.name)).toEqual(['Mass Production I']);
  });

  it('omits milestones when all are reached', () => {
    const record = certifiedPlanRecord(1, plan(), nameFor, 0, trained({ 3380: 2, 3387: 1 }));
    expect(record.milestones).toBeUndefined();
  });
});
