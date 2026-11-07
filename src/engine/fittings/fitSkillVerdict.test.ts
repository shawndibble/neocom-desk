import { describe, expect, it } from 'vitest';
import type { RequiredSkill } from '@/engine/import/fitToSkills';
import { fitSkillVerdict, type FitSkillVerdictInput } from './fitSkillVerdict';

const HULL = 603;
const GUN = 3001;
const DRONE = 2185;
const GUNNERY = 3300;
const DRONES = 3436;
const FRIGATE = 3330;

const requirementsByType = new Map<number, readonly RequiredSkill[]>([
  [HULL, [{ skillTypeID: FRIGATE, level: 1 }]],
  [GUN, [{ skillTypeID: GUNNERY, level: 5 }]],
  [DRONE, [{ skillTypeID: DRONES, level: 2 }]],
]);

function input(overrides: Partial<FitSkillVerdictInput> = {}): FitSkillVerdictInput {
  return {
    requirementsByType,
    skillLevels: new Map([
      [FRIGATE, 1],
      [GUNNERY, 5],
      [DRONES, 2],
    ]),
    skills: new Map([
      [FRIGATE, { alphaMaxLevel: 4 }],
      [GUNNERY, { alphaMaxLevel: 4 }],
      [DRONES, { alphaMaxLevel: 4 }],
    ]),
    cloneState: 'omega',
    ...overrides,
  };
}

describe('fitSkillVerdict', () => {
  it('can fly once every type it carries is trained for', () => {
    expect(fitSkillVerdict([HULL, GUN, DRONE], input())).toEqual({ kind: 'canFly' });
  });

  it('counts each missing skill once, at its highest required level', () => {
    const verdict = fitSkillVerdict(
      [HULL, GUN, DRONE],
      input({ skillLevels: new Map([[FRIGATE, 1]]) })
    );
    expect(verdict).toEqual({ kind: 'missing', count: 2, omegaOnly: false });
  });

  it('is Omega only for an Alpha who needs a skill past the Alpha cap', () => {
    const levels = new Map([
      [FRIGATE, 1],
      [GUNNERY, 4],
      [DRONES, 2],
    ]);
    expect(
      fitSkillVerdict([HULL, GUN], input({ skillLevels: levels, cloneState: 'alpha' }))
    ).toEqual({ kind: 'missing', count: 1, omegaOnly: true });
    // An Omega can train it: the gap is only a gap.
    expect(fitSkillVerdict([HULL, GUN], input({ skillLevels: levels }))).toEqual({
      kind: 'missing',
      count: 1,
      omegaOnly: false,
    });
  });

  it('never flags a skill the catalog does not know as Omega only', () => {
    const verdict = fitSkillVerdict(
      [GUN],
      input({ skillLevels: new Map(), skills: new Map(), cloneState: 'alpha' })
    );
    expect(verdict).toEqual({ kind: 'missing', count: 1, omegaOnly: false });
  });

  it('is unknown, never can fly, when a type it carries could not be read', () => {
    expect(fitSkillVerdict([HULL, 9999], input())).toEqual({ kind: 'unknown' });
  });

  it('a confirmed gap wins over an unreadable type', () => {
    const verdict = fitSkillVerdict([GUN, 9999], input({ skillLevels: new Map() }));
    expect(verdict).toEqual({ kind: 'missing', count: 1, omegaOnly: false });
  });
});
