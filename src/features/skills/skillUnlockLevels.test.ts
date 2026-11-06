import { describe, expect, it } from 'vitest';
import { buildItemUnlocks, groupUnlocksByLevel, unlockKindOf } from './skillUnlockLevels';

const types = {
  587: { name: 'Rifter', groupID: 25 },
  585: { name: 'Slasher', groupID: 25 },
  2873: { name: '125mm Gatling AutoCannon II', groupID: 55 },
  178: { name: 'Carbonized Lead S', groupID: 83 },
  2456: { name: 'Hobgoblin II', groupID: 100 },
  10228: { name: 'Zainou Gnome', groupID: 300 },
  23: { name: 'Small Secure Container', groupID: 340 },
};
const groupCategories = { 25: 6, 55: 7, 83: 8, 100: 18, 300: 20, 340: 2 };

describe('unlockKindOf', () => {
  it('maps inventory categories to the kinds the skill Show info groups by', () => {
    expect(unlockKindOf(6)).toBe('ship');
    expect(unlockKindOf(7)).toBe('module');
    expect(unlockKindOf(32)).toBe('module');
    expect(unlockKindOf(66)).toBe('module');
    expect(unlockKindOf(8)).toBe('charge');
    expect(unlockKindOf(18)).toBe('drone');
    expect(unlockKindOf(87)).toBe('drone');
    expect(unlockKindOf(20)).toBe('implant');
    expect(unlockKindOf(22)).toBe('other');
    expect(unlockKindOf(undefined)).toBe('other');
  });
});

describe('buildItemUnlocks', () => {
  it('names and classifies every item the skill unlocks, skipping types the SDE lacks', () => {
    const index = {
      3329: [
        [585, 1],
        [587, 1],
        [2873, 4],
        [178, 1],
        [2456, 5],
        [10228, 2],
        [23, 1],
        [99999, 1],
      ] as [number, number][],
    };
    expect(buildItemUnlocks(3329, index, types, groupCategories)).toEqual([
      { typeID: 585, name: 'Slasher', level: 1, kind: 'ship' },
      { typeID: 587, name: 'Rifter', level: 1, kind: 'ship' },
      { typeID: 2873, name: '125mm Gatling AutoCannon II', level: 4, kind: 'module' },
      { typeID: 178, name: 'Carbonized Lead S', level: 1, kind: 'charge' },
      { typeID: 2456, name: 'Hobgoblin II', level: 5, kind: 'drone' },
      { typeID: 10228, name: 'Zainou Gnome', level: 2, kind: 'implant' },
      { typeID: 23, name: 'Small Secure Container', level: 1, kind: 'other' },
    ]);
  });

  it('is empty for a skill that unlocks no items', () => {
    expect(buildItemUnlocks(1, {}, types, groupCategories)).toEqual([]);
  });
});

describe('groupUnlocksByLevel', () => {
  it('buckets skills and items by level, in kind order, names sorted, empty levels dropped', () => {
    const skills = [
      { typeID: 10, name: 'Small Projectile Turret', level: 1 },
      { typeID: 11, name: 'Minmatar Destroyer', level: 4 },
      { typeID: 12, name: 'Assault Frigates', level: 4 },
    ];
    const items = [
      { typeID: 587, name: 'Rifter', level: 1, kind: 'ship' as const },
      { typeID: 585, name: 'Slasher', level: 1, kind: 'ship' as const },
      { typeID: 178, name: 'Carbonized Lead S', level: 1, kind: 'charge' as const },
      { typeID: 2873, name: 'Gatling', level: 4, kind: 'module' as const },
    ];
    expect(groupUnlocksByLevel(skills, items)).toEqual([
      {
        level: 1,
        count: 4,
        groups: [
          { kind: 'skill', rows: [{ typeID: 10, name: 'Small Projectile Turret', level: 1 }] },
          {
            kind: 'ship',
            rows: [
              { typeID: 587, name: 'Rifter', level: 1, kind: 'ship' },
              { typeID: 585, name: 'Slasher', level: 1, kind: 'ship' },
            ],
          },
          {
            kind: 'charge',
            rows: [{ typeID: 178, name: 'Carbonized Lead S', level: 1, kind: 'charge' }],
          },
        ],
      },
      {
        level: 4,
        count: 3,
        groups: [
          {
            kind: 'skill',
            rows: [
              { typeID: 12, name: 'Assault Frigates', level: 4 },
              { typeID: 11, name: 'Minmatar Destroyer', level: 4 },
            ],
          },
          {
            kind: 'module',
            rows: [{ typeID: 2873, name: 'Gatling', level: 4, kind: 'module' }],
          },
        ],
      },
    ]);
  });

  it('is empty when nothing is unlocked', () => {
    expect(groupUnlocksByLevel([], [])).toEqual([]);
  });
});
