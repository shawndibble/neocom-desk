import { describe, it, expect } from 'vitest';
import { alphaCappedStepIndices, exceedsAlphaCap } from '@/engine/alphaCap';
import type { EngineSkill, PlanStep } from '@/engine/types';

const skill = (alphaMaxLevel?: number): EngineSkill => ({
  typeID: 1,
  name: 'Skill',
  rank: 1,
  primary: 'intelligence',
  secondary: 'memory',
  prereqs: [],
  alphaMaxLevel,
});

describe('exceedsAlphaCap', () => {
  it('allows levels up to the cap', () => {
    expect(exceedsAlphaCap(skill(4), 1)).toBe(false);
    expect(exceedsAlphaCap(skill(4), 4)).toBe(false);
  });

  it('flags a level above the cap', () => {
    expect(exceedsAlphaCap(skill(4), 5)).toBe(true);
  });

  it('flags every level of a skill Alphas cannot train', () => {
    expect(exceedsAlphaCap(skill(), 1)).toBe(true);
    expect(exceedsAlphaCap(skill(0), 1)).toBe(true);
  });
});

describe('alphaCappedStepIndices', () => {
  it('lists the steps an Alpha clone cannot train', () => {
    const skills = new Map<number, EngineSkill>([
      [1, { ...skill(3), typeID: 1 }],
      [2, { ...skill(), typeID: 2 }],
    ]);
    const steps: PlanStep[] = [
      { skillTypeID: 1, level: 3 },
      { skillTypeID: 1, level: 4 },
      { skillTypeID: 2, level: 1 },
    ];
    expect([...alphaCappedStepIndices(steps, skills)]).toEqual([1, 2]);
  });

  it('skips a step whose skill is unknown', () => {
    expect(alphaCappedStepIndices([{ skillTypeID: 9, level: 1 }], new Map()).size).toBe(0);
  });
});
