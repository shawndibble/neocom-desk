import { describe, it, expect } from 'vitest';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { scheduleJobs } from '@/engine/industry/jobSchedule';
import { categoryForActivity, planJobNodes, planStages, scheduleWhen } from './planJobSlots';

const sub = (typeID: number, seconds: number, inputs: ResolvedMaterial[] = []) =>
  ({ subBuild: { typeID, seconds, inputs } }) as unknown as ResolvedMaterial;

const catalog = {
  byProductTypeID: new Map([[100, { blueprint: { activity: 'reaction' } }]]),
} as unknown as Parameters<typeof planJobNodes>[1];

const ALL_V = {
  massProduction: 5,
  advancedMassProduction: 5,
  laboratoryOperation: 5,
  advancedLaboratoryOperation: 5,
  massReactions: 5,
  advancedMassReactions: 5,
};
const NOW = Date.UTC(2026, 9, 15, 12, 0); // Thu 12:00

describe('planJobNodes', () => {
  it('makes one job per tree node, each waiting on the sub-jobs it consumes', () => {
    const materials = [sub(1, 20, [sub(100, 30)]), sub(100, 40), {} as ResolvedMaterial];
    expect(
      planJobNodes({ activity: 'manufacturing', seconds: 10, materials }, catalog, 'a:')
    ).toEqual([
      { id: 'a:0', seconds: 10, category: 'manufacturing', kind: 'final', deps: ['a:1', 'a:3'] },
      { id: 'a:1', seconds: 20, category: 'manufacturing', kind: 'part', deps: ['a:2'] },
      { id: 'a:2', seconds: 30, category: 'reaction', kind: 'reaction', deps: [] },
      { id: 'a:3', seconds: 40, category: 'reaction', kind: 'reaction', deps: [] },
    ]);
  });

  it('puts a reaction plan in the reaction pool and still calls it the final item', () => {
    const [root] = planJobNodes({ activity: 'reaction', seconds: 5, materials: [] }, catalog);
    expect(root).toMatchObject({ id: '0', category: 'reaction', kind: 'final' });
  });

  it('maps a reaction plan to the reaction pool', () => {
    expect(categoryForActivity('reaction')).toBe('reaction');
  });
});

describe('planStages', () => {
  it('counts each stage by kind, in build order', () => {
    const nodes = planJobNodes(
      {
        activity: 'manufacturing',
        seconds: 100,
        materials: [sub(1, 20, [sub(100, 30), sub(100, 30)]), sub(2, 10)],
      },
      catalog
    );
    const schedule = scheduleJobs(nodes, { skills: ALL_V, jobs: [] }, NOW);
    expect(planStages(schedule, nodes)).toEqual([
      { startMs: NOW, counts: { reaction: 2, part: 1, final: 0 } },
      { startMs: NOW + 30_000, counts: { reaction: 0, part: 1, final: 0 } },
      { startMs: NOW + 50_000, counts: { reaction: 0, part: 0, final: 1 } },
    ]);
  });
});

describe('scheduleWhen', () => {
  it('reads a weekday and EVE time inside the coming week', () => {
    expect(scheduleWhen(NOW + 26.5 * 3_600_000, NOW)).toBe('Fri 14:30');
  });

  it('falls back to the date once the weekday would repeat', () => {
    expect(scheduleWhen(NOW + 8 * 86_400_000, NOW)).toBe('10-23 12:00');
  });
});
