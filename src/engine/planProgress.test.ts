import { describe, it, expect } from 'vitest';
import { planProgress } from '@/engine/planProgress';
import { spForLevel } from '@/engine/sp';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';

function skill(
  typeID: number,
  rank: number,
  prereqs: { typeID: number; level: number }[] = []
): EngineSkill {
  return {
    typeID,
    name: `Skill ${typeID}`,
    rank,
    primary: 'intelligence',
    secondary: 'memory',
    prereqs,
  };
}

const skills = new Map<number, EngineSkill>([
  [100, skill(100, 1)],
  [200, skill(200, 2, [{ typeID: 100, level: 2 }])],
]);

const at = (id: number, level: number, sp: number): [number, TrainedSkill] => [id, { level, sp }];
const entry = (skillTypeID: number, targetLevel: number): PlanEntry => ({
  skillTypeID,
  targetLevel,
});

describe('planProgress', () => {
  it('is empty with a null fraction for an empty plan', () => {
    expect(planProgress([], skills, new Map())).toEqual({
      trainedSp: 0,
      totalSp: 0,
      fraction: null,
    });
  });

  it('reads 0 when nothing is trained', () => {
    const p = planProgress([entry(100, 3)], skills, new Map());
    expect(p.trainedSp).toBe(0);
    expect(p.totalSp).toBe(spForLevel(1, 3));
    expect(p.fraction).toBe(0);
  });

  it('reads 1 when everything is trained', () => {
    const p = planProgress([entry(100, 3)], skills, new Map([at(100, 3, spForLevel(1, 3))]));
    expect(p.fraction).toBe(1);
    expect(p.trainedSp).toBe(p.totalSp);
  });

  it('counts an injected prerequisite on both sides', () => {
    const p = planProgress([entry(200, 1)], skills, new Map([at(100, 2, spForLevel(1, 2))]));
    expect(p.totalSp).toBe(spForLevel(1, 2) + spForLevel(2, 1));
    expect(p.trainedSp).toBe(spForLevel(1, 2));
  });

  it('banks the SP of a part-trained level', () => {
    const half = spForLevel(1, 1) + Math.floor((spForLevel(1, 2) - spForLevel(1, 1)) / 2);
    const p = planProgress([entry(100, 2)], skills, new Map([at(100, 1, half)]));
    expect(p.trainedSp).toBe(half);
  });

  it('never counts more than the plan asks for when trained past the target', () => {
    const p = planProgress([entry(100, 2)], skills, new Map([at(100, 5, spForLevel(1, 5))]));
    expect(p.fraction).toBe(1);
    expect(p.trainedSp).toBe(p.totalSp);
  });

  it('skips an unknown skill id', () => {
    expect(planProgress([entry(999, 3)], skills, new Map())).toEqual({
      trainedSp: 0,
      totalSp: 0,
      fraction: null,
    });
  });
});
