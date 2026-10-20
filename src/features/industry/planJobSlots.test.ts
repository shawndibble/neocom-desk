import { describe, it, expect } from 'vitest';
import type { ResolvedMaterial } from '@/engine/industry/materialResolution';
import { scheduleJobs, scheduleJobsAcrossCharacters } from '@/engine/industry/jobSchedule';
import { characterModifiers } from '@/engine/industry/characterModifiers';
import {
  assignCharacters,
  categoryForActivity,
  planJobNodes,
  planLanes,
  planStages,
  type PlanJobNode,
} from './planJobSlots';

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
      {
        id: 'a:2',
        seconds: 30,
        category: 'reaction',
        kind: 'reaction',
        deps: [],
        activity: 'reaction',
      },
      {
        id: 'a:3',
        seconds: 40,
        category: 'reaction',
        kind: 'reaction',
        deps: [],
        activity: 'reaction',
      },
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

describe('assignCharacters', () => {
  const INDUSTRY = 3380;
  const trained = (level: number) =>
    characterModifiers({ skills: { [INDUSTRY]: level }, implantTypeIds: [] });
  const node = (blueprintTypeID: number | undefined): PlanJobNode => ({
    id: '0',
    seconds: 1000,
    category: 'manufacturing',
    kind: 'final',
    deps: [],
    blueprintTypeID,
  });
  const alice = { characterId: 1, modifiers: trained(0), blueprintTypeIDs: new Set([7]) };
  const bob = { characterId: 2, modifiers: trained(5), blueprintTypeIDs: new Set<number>() };

  it('lets only a Character who owns the blueprint run the job', () => {
    const [n] = assignCharacters([node(7)], [alice, bob], 1);
    expect([...n.secondsByCharacter!.keys()]).toEqual([1]);
  });

  it("rescales the seconds by each Character's own skills", () => {
    const withBoth = { ...bob, blueprintTypeIDs: new Set([7]) };
    const [n] = assignCharacters([node(7)], [alice, withBoth], 1);
    expect(n.secondsByCharacter!.get(1)).toBe(1000);
    expect(n.secondsByCharacter!.get(2)).toBeCloseTo(1000 * 0.8, 6);
  });

  it('puts a corp-owned copy in reach of everyone', () => {
    const [n] = assignCharacters([node(9)], [alice, bob], 1, new Set([9]));
    expect([...n.secondsByCharacter!.keys()].sort()).toEqual([1, 2]);
  });

  it('keeps a job nobody owns with the plan Character', () => {
    const [n] = assignCharacters([node(99), node(undefined)], [alice, bob], 2);
    expect([...n.secondsByCharacter!]).toEqual([[2, 1000]]);
  });
});

describe('planLanes', () => {
  const one = {
    jobs: [],
    skills: ALL_V,
  };
  const nodes: PlanJobNode[] = [
    { id: 'r', seconds: 100, category: 'manufacturing', kind: 'final', deps: ['a', 'b'] },
    { id: 'a', seconds: 50, category: 'manufacturing', kind: 'part', deps: [] },
    { id: 'b', seconds: 50, category: 'reaction', kind: 'reaction', deps: [] },
  ];

  it('is empty when one Character does all the work', () => {
    const schedule = scheduleJobsAcrossCharacters(nodes, [{ characterId: 1, ...one }], NOW);
    expect(planLanes(schedule, nodes)).toEqual([]);
  });

  it("groups each Character's jobs by stage", () => {
    const noSlots = { massProduction: 0, advancedMassProduction: 0 } as unknown as typeof ALL_V;
    const split = nodes.map((n) =>
      n.id === 'b' ? { ...n, secondsByCharacter: new Map([[2, 50]]) } : n
    );
    const schedule = scheduleJobsAcrossCharacters(
      split,
      [
        { characterId: 1, jobs: [], skills: ALL_V },
        { characterId: 2, jobs: [], skills: { ...ALL_V, ...noSlots } },
      ],
      NOW
    );
    const lanes = planLanes(schedule, split);
    expect(lanes.map((l) => l.characterId).sort()).toEqual([1, 2]);
    const lane2 = lanes.find((l) => l.characterId === 2)!;
    expect(lane2.stages).toEqual([{ startMs: NOW, counts: { reaction: 1, part: 0, final: 0 } }]);
  });
});
