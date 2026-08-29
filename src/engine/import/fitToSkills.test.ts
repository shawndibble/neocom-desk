import { describe, it, expect } from 'vitest';
import { fitToSkills } from '@/engine/import/fitToSkills';
import type { RequiredSkill } from '@/engine/import/fitToSkills';

const TYPE_BY_NAME = new Map([
  ['rifter', { typeID: 587 }],
  ['125mm gatling autocannon ii', { typeID: 2873 }],
  ['damage control ii', { typeID: 2048 }],
]);

const REQUIRED: Record<number, RequiredSkill[]> = {
  587: [{ skillTypeID: 3327, level: 1 }], // Spaceship Command
  2873: [
    { skillTypeID: 3300, level: 3 }, // Gunnery
    { skillTypeID: 3301, level: 1 }, // Small Projectile Turret
  ],
  2048: [{ skillTypeID: 3300, level: 1 }], // Gunnery (lower level than the gun)
};

function requiredSkills(typeID: number): RequiredSkill[] {
  return REQUIRED[typeID] ?? [];
}

describe('fitToSkills', () => {
  it('aggregates required skills across ship + modules, taking the max level per skill', () => {
    const result = fitToSkills(
      {
        shipName: 'Rifter',
        items: [
          { name: '125mm Gatling AutoCannon II', quantity: 2 },
          { name: 'Damage Control II', quantity: 1 },
        ],
      },
      TYPE_BY_NAME,
      requiredSkills
    );
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([
      { skillTypeID: 3300, targetLevel: 3 },
      { skillTypeID: 3301, targetLevel: 1 },
      { skillTypeID: 3327, targetLevel: 1 },
    ]);
  });

  it('is case-insensitive on item name lookup', () => {
    const result = fitToSkills({ shipName: 'RIFTER', items: [] }, TYPE_BY_NAME, requiredSkills);
    expect(result.entries).toEqual([{ skillTypeID: 3327, targetLevel: 1 }]);
  });

  it('reports an error for unknown item names instead of throwing', () => {
    const result = fitToSkills(
      { shipName: 'Rifter', items: [{ name: 'Not A Real Module', quantity: 1 }] },
      TYPE_BY_NAME,
      requiredSkills
    );
    expect(result.errors).toEqual([{ itemName: 'Not A Real Module', reason: 'unknown item' }]);
    expect(result.entries).toEqual([{ skillTypeID: 3327, targetLevel: 1 }]);
  });

  it('does not error on an empty/unresolved ship name', () => {
    const result = fitToSkills({ shipName: '', items: [] }, TYPE_BY_NAME, requiredSkills);
    expect(result.errors).toEqual([]);
    expect(result.entries).toEqual([]);
  });

  it('reports an error for an unknown ship name', () => {
    const result = fitToSkills(
      { shipName: 'Not A Real Ship', items: [] },
      TYPE_BY_NAME,
      requiredSkills
    );
    expect(result.errors).toEqual([{ itemName: 'Not A Real Ship', reason: 'unknown item' }]);
  });

  it('handles empty items with no ship: empty result, no throw', () => {
    expect(() =>
      fitToSkills({ shipName: '', items: [] }, TYPE_BY_NAME, requiredSkills)
    ).not.toThrow();
    const result = fitToSkills({ shipName: '', items: [] }, TYPE_BY_NAME, requiredSkills);
    expect(result).toEqual({ entries: [], errors: [] });
  });

  it('handles garbage items: all errors, no throw', () => {
    const result = fitToSkills(
      {
        shipName: '',
        items: [
          { name: 'asdf', quantity: 1 },
          { name: '####', quantity: 1 },
        ],
      },
      TYPE_BY_NAME,
      requiredSkills
    );
    expect(result.entries).toEqual([]);
    expect(result.errors).toHaveLength(2);
  });

  it('items with no required skills contribute nothing', () => {
    const result = fitToSkills(
      { shipName: '', items: [{ name: 'Damage Control II', quantity: 1 }] },
      TYPE_BY_NAME,
      (typeID) => (typeID === 2048 ? [] : requiredSkills(typeID))
    );
    expect(result.entries).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
