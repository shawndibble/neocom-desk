import { describe, expect, it } from 'vitest';
import { SKILL_REQUIREMENT_PAIRS } from '../../src/engine/market/itemAttributes';
import { bakeSkillItemUnlocks, REQUIRED_SKILL_ATTRIBUTE_PAIRS } from './skillItemUnlocks.mjs';

const SHIP_GROUP = 25;
const SKILL_GROUP = 255;
const ROID_GROUP = 450;
const MATERIAL_GROUP = 18;
const groupCategories = {
  [SHIP_GROUP]: 6,
  [SKILL_GROUP]: 16,
  [ROID_GROUP]: 25,
  [MATERIAL_GROUP]: 4,
};
const record = (attributes) => ({ attributes });

describe('bakeSkillItemUnlocks', () => {
  it('reads the same requirement attribute pairs the app does', () => {
    expect(REQUIRED_SKILL_ATTRIBUTE_PAIRS).toEqual(SKILL_REQUIREMENT_PAIRS);
  });

  it('indexes each item under every skill it requires, with the level, ids sorted', () => {
    const shards = [
      {
        587: record([
          [182, 3329],
          [277, 1],
          [183, 3300],
          [278, 2],
        ]),
        585: record([
          [182, 3329],
          [277, 3],
        ]),
      },
    ];
    const types = { 585: { groupID: SHIP_GROUP }, 587: { groupID: SHIP_GROUP } };
    expect(bakeSkillItemUnlocks(shards, types, groupCategories)).toEqual({
      3300: [[587, 2]],
      3329: [
        [585, 3],
        [587, 1],
      ],
    });
  });

  it('skips skills, asteroids, materials, types outside types.json and empty requirement slots', () => {
    const shards = [
      {
        1: record([
          [182, 3300],
          [277, 1],
        ]),
        2: record([
          [182, 3386],
          [277, 1],
        ]),
        3: record([
          [182, 3300],
          [277, 1],
        ]),
        4: record([
          [182, 0],
          [277, 0],
        ]),
        5: record([
          [182, 12196],
          [277, 1],
        ]),
      },
    ];
    const types = {
      1: { groupID: SKILL_GROUP },
      2: { groupID: ROID_GROUP },
      4: { groupID: SHIP_GROUP },
      5: { groupID: MATERIAL_GROUP },
    };
    expect(bakeSkillItemUnlocks(shards, types, groupCategories)).toEqual({});
  });
});
