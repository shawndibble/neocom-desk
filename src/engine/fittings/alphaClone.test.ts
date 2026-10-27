import { describe, expect, it } from 'vitest';
import type { EngineSkill } from '@/engine/types';
import { fittingAlphaBlockers } from './alphaClone';

function skill(
  typeID: number,
  alphaMaxLevel: number | undefined,
  prereqs: EngineSkill['prereqs'] = []
) {
  return [
    typeID,
    {
      typeID,
      name: `Skill ${typeID}`,
      rank: 1,
      primary: 'memory',
      secondary: 'intelligence',
      prereqs,
      alphaMaxLevel,
    } satisfies EngineSkill,
  ] as const;
}

const GALLENTE_CRUISER = 3332;
const HEAVY_ASSAULT_CRUISERS = 16591;
const SPACESHIP_COMMAND = 3327;
const MEDIUM_DRONE_OPERATION = 33699;
const DRONES = 3436;

const SKILLS = new Map([
  skill(GALLENTE_CRUISER, 4, [{ typeID: SPACESHIP_COMMAND, level: 3 }]),
  // Alphas can't train it at all: no cap.
  skill(HEAVY_ASSAULT_CRUISERS, undefined, [{ typeID: GALLENTE_CRUISER, level: 5 }]),
  skill(SPACESHIP_COMMAND, 4),
  skill(MEDIUM_DRONE_OPERATION, 4, [{ typeID: DRONES, level: 5 }]),
  skill(DRONES, 5),
]);

describe('fittingAlphaBlockers', () => {
  it('finds nothing when every required skill, and every prerequisite, is within the Alpha caps', () => {
    expect(
      fittingAlphaBlockers(
        [
          { skillTypeID: GALLENTE_CRUISER, level: 3 },
          { skillTypeID: MEDIUM_DRONE_OPERATION, level: 2 },
        ],
        SKILLS
      )
    ).toEqual([]);
  });

  it('lists each required level an Alpha cannot train, once, at the highest level asked', () => {
    expect(
      fittingAlphaBlockers(
        [
          { skillTypeID: GALLENTE_CRUISER, level: 5 },
          { skillTypeID: GALLENTE_CRUISER, level: 3 },
          { skillTypeID: MEDIUM_DRONE_OPERATION, level: 5 },
        ],
        SKILLS
      )
    ).toEqual([
      { skillTypeID: GALLENTE_CRUISER, level: 5, alphaMaxLevel: 4 },
      { skillTypeID: MEDIUM_DRONE_OPERATION, level: 5, alphaMaxLevel: 4 },
    ]);
  });

  it('follows prerequisites: a T2 hull skill Alphas cannot train, and what it needs beneath it', () => {
    expect(
      fittingAlphaBlockers([{ skillTypeID: HEAVY_ASSAULT_CRUISERS, level: 1 }], SKILLS)
    ).toEqual([
      { skillTypeID: HEAVY_ASSAULT_CRUISERS, level: 1, alphaMaxLevel: 0 },
      { skillTypeID: GALLENTE_CRUISER, level: 5, alphaMaxLevel: 4 },
    ]);
  });

  it('skips a skill the catalog does not know, rather than calling the fit Omega-only on a guess', () => {
    expect(fittingAlphaBlockers([{ skillTypeID: 999, level: 5 }], SKILLS)).toEqual([]);
  });
});
