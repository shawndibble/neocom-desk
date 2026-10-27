import { describe, it, expect } from 'vitest';
import { scheduleJobs, scheduleJobsAcrossCharacters, type ScheduleNode } from './jobSchedule';
import { projectJobFinish, type JobSlotSkills } from './jobSlots';

const NO_SKILLS: JobSlotSkills = {
  massProduction: 0,
  advancedMassProduction: 0,
  laboratoryOperation: 0,
  advancedLaboratoryOperation: 0,
  massReactions: 0,
  advancedMassReactions: 0,
};
const ALL_V: JobSlotSkills = {
  massProduction: 5,
  advancedMassProduction: 5,
  laboratoryOperation: 5,
  advancedLaboratoryOperation: 5,
  massReactions: 5,
  advancedMassReactions: 5,
};
const NOW = 1_000_000;

const node = (
  id: string,
  seconds: number,
  deps: string[] = [],
  category: ScheduleNode['category'] = 'manufacturing'
): ScheduleNode => ({ id, seconds, deps, category });

describe('scheduleJobs', () => {
  it('runs sibling sub-jobs in parallel and starts the parent when the slowest finishes', () => {
    const s = scheduleJobs(
      [node('root', 100, ['a', 'b']), node('a', 50), node('b', 30)],
      { skills: ALL_V, jobs: [] },
      NOW
    );
    expect(s.jobs).toEqual([
      { id: 'root', startMs: NOW + 50_000, finishMs: NOW + 150_000, stage: 1 },
      { id: 'a', startMs: NOW, finishMs: NOW + 50_000, stage: 0 },
      { id: 'b', startMs: NOW, finishMs: NOW + 30_000, stage: 0 },
    ]);
    expect(s.finishMs).toBe(NOW + 150_000);
    expect(s.peakSlots).toBe(2);
  });

  it('waits on dependencies across pools: reaction, then part, then the final job', () => {
    const s = scheduleJobs(
      [node('root', 100, ['part']), node('part', 50, ['rx']), node('rx', 200, [], 'reaction')],
      { skills: ALL_V, jobs: [] },
      NOW
    );
    const byId = Object.fromEntries(s.jobs.map((j) => [j.id, j]));
    expect(byId.rx.startMs).toBe(NOW);
    expect(byId.part.startMs).toBe(NOW + 200_000);
    expect(byId.root.startMs).toBe(NOW + 250_000);
    expect(s.finishMs).toBe(NOW + 350_000);
    expect(s.peakSlots).toBe(1);
  });

  it('queues jobs on a full pool, longest remaining path first', () => {
    const s = scheduleJobs(
      [node('root', 100, ['a', 'b']), node('b', 30), node('a', 50)],
      { skills: NO_SKILLS, jobs: [] },
      NOW
    );
    const byId = Object.fromEntries(s.jobs.map((j) => [j.id, j]));
    expect(byId.a).toMatchObject({ startMs: NOW, finishMs: NOW + 50_000 });
    expect(byId.b).toMatchObject({ startMs: NOW + 50_000, finishMs: NOW + 80_000 });
    expect(byId.root).toMatchObject({ startMs: NOW + 80_000, finishMs: NOW + 180_000 });
    expect(s.peakSlots).toBe(1);
  });

  it('keeps separate pools independent: a full manufacturing pool does not hold up reactions', () => {
    const s = scheduleJobs(
      [node('m', 100), node('r', 100, [], 'reaction')],
      { skills: NO_SKILLS, jobs: [{ activityId: 1, endMs: NOW + 500_000 }] },
      NOW
    );
    const byId = Object.fromEntries(s.jobs.map((j) => [j.id, j]));
    expect(byId.r.startMs).toBe(NOW);
    expect(byId.m.startMs).toBe(NOW + 500_000);
  });

  it('starts each pool from the slots busy now', () => {
    const jobs = [
      { activityId: 1, endMs: NOW + 500_000 },
      { activityId: 1, endMs: NOW - 1 },
    ];
    const s = scheduleJobs([node('only', 100)], { skills: NO_SKILLS, jobs }, NOW);
    expect(s.jobs[0]).toMatchObject({ startMs: NOW + 500_000, finishMs: NOW + 600_000 });
  });

  it('matches projectJobFinish for a single job, including over capacity', () => {
    const jobs = [
      { activityId: 1, endMs: NOW + 30_000 },
      { activityId: 1, endMs: NOW + 10_000 },
      { activityId: 1, endMs: NOW + 20_000 },
    ];
    for (const character of [
      { skills: NO_SKILLS, jobs },
      { skills: ALL_V, jobs },
      { skills: NO_SKILLS, jobs: [] },
    ]) {
      const s = scheduleJobs([node('only', 60)], character, NOW);
      const p = projectJobFinish(character, 'manufacturing', 60, NOW);
      expect(s.jobs[0].startMs).toBe(p.startMs);
      expect(s.finishMs).toBe(p.finishMs);
    }
  });

  it('fills a second freeing slot before waiting on the first one again', () => {
    const skills = { ...NO_SKILLS, massProduction: 1 }; // 2 slots
    const jobs = [
      { activityId: 1, endMs: NOW + 10_000 },
      { activityId: 1, endMs: NOW + 40_000 },
    ];
    const s = scheduleJobs([node('a', 20), node('b', 20)], { skills, jobs }, NOW);
    const byId = Object.fromEntries(s.jobs.map((j) => [j.id, j]));
    expect(byId.a.startMs).toBe(NOW + 10_000);
    expect(byId.b.startMs).toBe(NOW + 30_000);
  });

  it('groups jobs into dependency stages, so a one-slot pool does not explode the stage list', () => {
    const leaves = ['a', 'b', 'c', 'd', 'e'];
    const s = scheduleJobs(
      [node('root', 10, leaves), ...leaves.map((id) => node(id, 10))],
      { skills: NO_SKILLS, jobs: [] },
      NOW
    );
    expect(s.stages).toEqual([
      { startMs: NOW, jobIds: ['a', 'b', 'c', 'd', 'e'] },
      { startMs: NOW + 50_000, jobIds: ['root'] },
    ]);
    expect(s.finishMs).toBe(NOW + 60_000);
  });

  it('puts a leaf deep under one branch in the first stage beside shallow leaves', () => {
    const s = scheduleJobs(
      [
        node('root', 10, ['part', 'hull']),
        node('part', 10, ['rx']),
        node('rx', 10, [], 'reaction'),
        node('hull', 10),
      ],
      { skills: ALL_V, jobs: [] },
      NOW
    );
    expect(s.stages.map((stage) => stage.jobIds)).toEqual([['rx', 'hull'], ['part'], ['root']]);
    expect(s.stages.map((stage) => stage.startMs)).toEqual([NOW, NOW + 10_000, NOW + 20_000]);
  });

  it('counts peak slots across pools, not jobs', () => {
    const s = scheduleJobs(
      [
        node('root', 10, ['p1', 'p2']),
        node('p1', 10, ['r1', 'r2']),
        node('p2', 10, ['r3']),
        node('r1', 10, [], 'reaction'),
        node('r2', 10, [], 'reaction'),
        node('r3', 10, [], 'reaction'),
      ],
      { skills: ALL_V, jobs: [] },
      NOW
    );
    // Back-to-back jobs share a slot: a finish at t frees it before a start at t.
    expect(s.peakSlots).toBe(3);
  });

  it('returns now and no slots for an empty plan', () => {
    const s = scheduleJobs([], { skills: ALL_V, jobs: [] }, NOW);
    expect(s).toEqual({ jobs: [], stages: [], finishMs: NOW, peakSlots: 0 });
  });

  it('rejects a dependency on an unknown job and a cycle', () => {
    expect(() =>
      scheduleJobs([node('a', 1, ['missing'])], { skills: ALL_V, jobs: [] }, NOW)
    ).toThrow();
    expect(() =>
      scheduleJobs([node('a', 1, ['b']), node('b', 1, ['a'])], { skills: ALL_V, jobs: [] }, NOW)
    ).toThrow();
  });
});

describe('scheduleJobsAcrossCharacters', () => {
  const SKILLS_ONE_SLOT = NO_SKILLS;
  const alice = { characterId: 1, skills: SKILLS_ONE_SLOT, jobs: [] };
  const bob = { characterId: 2, skills: SKILLS_ONE_SLOT, jobs: [] };

  it('spreads parallel jobs over Characters with free slots', () => {
    const s = scheduleJobsAcrossCharacters(
      [node('root', 10, ['a', 'b']), node('a', 50), node('b', 50)],
      [alice, bob],
      NOW
    );
    const byId = Object.fromEntries(s.jobs.map((j) => [j.id, j]));
    expect(byId.a.startMs).toBe(NOW);
    expect(byId.b.startMs).toBe(NOW);
    expect(new Set([byId.a.characterId, byId.b.characterId])).toEqual(new Set([1, 2]));
    expect(s.finishMs).toBe(NOW + 60_000);
  });

  it("times each job with the assigned Character's own seconds", () => {
    const s = scheduleJobsAcrossCharacters(
      [
        {
          ...node('a', 100),
          secondsByCharacter: new Map([
            [1, 100],
            [2, 40],
          ]),
        },
      ],
      [alice, bob],
      NOW
    );
    expect(s.jobs[0]).toMatchObject({ characterId: 2, finishMs: NOW + 40_000 });
  });

  it('gives a Character without the blueprint none of its jobs', () => {
    const s = scheduleJobsAcrossCharacters(
      [
        { ...node('a', 50), secondsByCharacter: new Map([[1, 50]]) },
        { ...node('b', 50), secondsByCharacter: new Map([[1, 50]]) },
      ],
      [alice, bob],
      NOW
    );
    expect(s.jobs.map((j) => j.characterId)).toEqual([1, 1]);
    expect(s.finishMs).toBe(NOW + 100_000);
  });

  it('queues behind a Character whose slot is busy rather than taking a faster busy one', () => {
    const busy = {
      characterId: 1,
      skills: SKILLS_ONE_SLOT,
      jobs: [{ activityId: 1, endMs: NOW + 500_000 }],
    };
    const s = scheduleJobsAcrossCharacters([node('a', 50)], [busy, bob], NOW);
    expect(s.jobs[0].characterId).toBe(2);
  });

  it('throws when no listed Character can run a job', () => {
    expect(() =>
      scheduleJobsAcrossCharacters(
        [{ ...node('a', 50), secondsByCharacter: new Map([[9, 50]]) }],
        [alice],
        NOW
      )
    ).toThrow(/No Character/);
  });

  it('matches scheduleJobs for one Character, apart from the Character id', () => {
    const nodes = [node('root', 100, ['a', 'b']), node('a', 50), node('b', 30)];
    const multi = scheduleJobsAcrossCharacters(nodes, [alice], NOW);
    const single = scheduleJobs(nodes, alice, NOW);
    expect(multi.jobs.map((j) => j.id)).toEqual(single.jobs.map((j) => j.id));
    expect(multi.jobs.map((j) => [j.startMs, j.finishMs, j.stage])).toEqual(
      single.jobs.map((j) => [j.startMs, j.finishMs, j.stage])
    );
    expect(multi.finishMs).toBe(single.finishMs);
    expect(multi.peakSlots).toBe(single.peakSlots);
  });
});
