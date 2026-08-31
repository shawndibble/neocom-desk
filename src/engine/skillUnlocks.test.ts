import { describe, it, expect } from 'vitest';
import { buildUnlockIndex } from './skillUnlocks';
import type { EngineSkill } from './types';

function skill(overrides: Partial<EngineSkill> & { typeID: number }): EngineSkill {
  return {
    name: `Skill ${overrides.typeID}`,
    rank: 1,
    primary: 'intelligence',
    secondary: 'memory',
    prereqs: [],
    ...overrides,
  };
}

describe('buildUnlockIndex', () => {
  it('maps a prereq skill to the skill it unlocks, with the level required', () => {
    const skills = new Map<number, EngineSkill>([
      [1, skill({ typeID: 1 })],
      [2, skill({ typeID: 2, prereqs: [{ typeID: 1, level: 3 }] })],
    ]);

    const index = buildUnlockIndex(skills);

    expect(index.get(1)).toEqual([{ typeID: 2, level: 3 }]);
  });

  it('has no entry for a skill that unlocks nothing', () => {
    const skills = new Map<number, EngineSkill>([[1, skill({ typeID: 1 })]]);

    expect(buildUnlockIndex(skills).get(1)).toBeUndefined();
  });

  it('collects every skill unlocked by one prereq', () => {
    const skills = new Map<number, EngineSkill>([
      [1, skill({ typeID: 1 })],
      [2, skill({ typeID: 2, prereqs: [{ typeID: 1, level: 2 }] })],
      [3, skill({ typeID: 3, prereqs: [{ typeID: 1, level: 4 }] })],
    ]);

    const index = buildUnlockIndex(skills);

    expect(index.get(1)).toEqual([
      { typeID: 2, level: 2 },
      { typeID: 3, level: 4 },
    ]);
  });

  it('lets one skill require several prereqs without cross-contaminating their unlock entries', () => {
    const skills = new Map<number, EngineSkill>([
      [1, skill({ typeID: 1 })],
      [2, skill({ typeID: 2 })],
      [
        3,
        skill({
          typeID: 3,
          prereqs: [
            { typeID: 1, level: 1 },
            { typeID: 2, level: 5 },
          ],
        }),
      ],
    ]);

    const index = buildUnlockIndex(skills);

    expect(index.get(1)).toEqual([{ typeID: 3, level: 1 }]);
    expect(index.get(2)).toEqual([{ typeID: 3, level: 5 }]);
  });
});
