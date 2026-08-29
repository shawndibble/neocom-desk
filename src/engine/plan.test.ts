import { describe, it, expect } from 'vitest';
import { normalizePlan } from '@/engine/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';

function skill(typeID: number, name: string, prereqs: { typeID: number; level: number }[] = []): EngineSkill {
  return { typeID, name, rank: 1, primary: 'intelligence', secondary: 'memory', prereqs };
}

function skillMap(...list: EngineSkill[]): Map<number, EngineSkill> {
  return new Map(list.map((s) => [s.typeID, s]));
}

function trained(entries: [number, number][]): Map<number, TrainedSkill> {
  return new Map(entries.map(([id, level]) => [id, { level, sp: 0 }]));
}

describe('normalizePlan', () => {
  it('expands an entry into per-level steps I..target', () => {
    const skills = skillMap(skill(100, 'Gunnery'));
    const entries: PlanEntry[] = [{ skillTypeID: 100, targetLevel: 4 }];
    expect(normalizePlan(entries, skills, new Map())).toEqual([
      { skillTypeID: 100, level: 1 },
      { skillTypeID: 100, level: 2 },
      { skillTypeID: 100, level: 3 },
      { skillTypeID: 100, level: 4 },
    ]);
  });

  it('skips already-trained levels', () => {
    const skills = skillMap(skill(100, 'Gunnery'));
    const steps = normalizePlan([{ skillTypeID: 100, targetLevel: 4 }], skills, trained([[100, 2]]));
    expect(steps).toEqual([
      { skillTypeID: 100, level: 3 },
      { skillTypeID: 100, level: 4 },
    ]);
  });

  it('produces no steps when target is at or below trained level', () => {
    const skills = skillMap(skill(100, 'Gunnery'));
    expect(normalizePlan([{ skillTypeID: 100, targetLevel: 3 }], skills, trained([[100, 5]]))).toEqual([]);
  });

  it('inserts prerequisites before dependents', () => {
    const skills = skillMap(
      skill(1, 'Spaceship Command'),
      skill(2, 'Caldari Frigate', [{ typeID: 1, level: 3 }]),
    );
    const steps = normalizePlan([{ skillTypeID: 2, targetLevel: 1 }], skills, new Map());
    expect(steps).toEqual([
      { skillTypeID: 1, level: 1 },
      { skillTypeID: 1, level: 2 },
      { skillTypeID: 1, level: 3 },
      { skillTypeID: 2, level: 1 },
    ]);
  });

  it('handles diamond prerequisites without duplicates', () => {
    // A needs B and C; B and C both need D II
    const skills = skillMap(
      skill(4, 'D'),
      skill(2, 'B', [{ typeID: 4, level: 2 }]),
      skill(3, 'C', [{ typeID: 4, level: 2 }]),
      skill(1, 'A', [{ typeID: 2, level: 1 }, { typeID: 3, level: 1 }]),
    );
    const steps = normalizePlan([{ skillTypeID: 1, targetLevel: 1 }], skills, new Map());
    expect(steps).toEqual([
      { skillTypeID: 4, level: 1 },
      { skillTypeID: 4, level: 2 },
      { skillTypeID: 2, level: 1 },
      { skillTypeID: 3, level: 1 },
      { skillTypeID: 1, level: 1 },
    ]);
  });

  it('resolves deep prerequisite chains', () => {
    const skills = skillMap(
      skill(1, 'L1'),
      skill(2, 'L2', [{ typeID: 1, level: 2 }]),
      skill(3, 'L3', [{ typeID: 2, level: 2 }]),
      skill(4, 'L4', [{ typeID: 3, level: 2 }]),
    );
    const steps = normalizePlan([{ skillTypeID: 4, targetLevel: 1 }], skills, new Map());
    expect(steps.map((s) => `${s.skillTypeID}:${s.level}`)).toEqual([
      '1:1', '1:2', '2:1', '2:2', '3:1', '3:2', '4:1',
    ]);
  });

  it('skips prerequisites satisfied by trained skills', () => {
    const skills = skillMap(
      skill(1, 'Base'),
      skill(2, 'Dependent', [{ typeID: 1, level: 3 }]),
    );
    const steps = normalizePlan(
      [{ skillTypeID: 2, targetLevel: 2 }],
      skills,
      trained([[1, 3], [2, 1]]),
    );
    expect(steps).toEqual([{ skillTypeID: 2, level: 2 }]);
  });

  it('preserves user order and deduplicates across entries', () => {
    const skills = skillMap(skill(1, 'A'), skill(2, 'B'));
    const steps = normalizePlan(
      [
        { skillTypeID: 1, targetLevel: 2 },
        { skillTypeID: 2, targetLevel: 1 },
        { skillTypeID: 1, targetLevel: 3 }, // extends earlier entry, no duplicate I/II
      ],
      skills,
      new Map(),
    );
    expect(steps).toEqual([
      { skillTypeID: 1, level: 1 },
      { skillTypeID: 1, level: 2 },
      { skillTypeID: 2, level: 1 },
      { skillTypeID: 1, level: 3 },
    ]);
  });

  it('throws on unknown skill typeID', () => {
    expect(() => normalizePlan([{ skillTypeID: 999, targetLevel: 1 }], skillMap(), new Map())).toThrow(/999/);
  });

  it('throws on circular prerequisites', () => {
    const skills = skillMap(
      skill(1, 'A', [{ typeID: 2, level: 1 }]),
      skill(2, 'B', [{ typeID: 1, level: 1 }]),
    );
    expect(() => normalizePlan([{ skillTypeID: 1, targetLevel: 1 }], skills, new Map())).toThrow(/circular/i);
  });
});
