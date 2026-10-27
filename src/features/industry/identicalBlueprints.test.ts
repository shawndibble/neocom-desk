import { describe, expect, it } from 'vitest';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { groupIdentical, identicalBlueprintKey } from './identicalBlueprints';

function bp(overrides: Partial<CharacterBlueprint> = {}): CharacterBlueprint {
  return {
    item_id: 1,
    type_id: 691,
    runs: 5,
    material_efficiency: 0,
    time_efficiency: 0,
    quantity: -2,
    location_id: 60003760,
    location_flag: 'Hangar',
    ...overrides,
  };
}

describe('identicalBlueprintKey', () => {
  it('ignores the item id, so two copies of one print share a key', () => {
    expect(identicalBlueprintKey('c:1', bp({ item_id: 1 }))).toBe(
      identicalBlueprintKey('c:1', bp({ item_id: 2 }))
    );
  });

  it.each([
    ['location', { location_id: 1 }],
    ['ME', { material_efficiency: 10 }],
    ['TE', { time_efficiency: 20 }],
    ['runs', { runs: 4 }],
    ['blueprint type', { type_id: 692 }],
  ])('tells copies apart by %s', (_label, overrides) => {
    expect(identicalBlueprintKey('c:1', bp())).not.toBe(
      identicalBlueprintKey('c:1', bp(overrides))
    );
  });

  it('tells copies apart by owner', () => {
    expect(identicalBlueprintKey('c:1', bp())).not.toBe(identicalBlueprintKey('c:2', bp()));
  });
});

describe('groupIdentical', () => {
  it('folds rows sharing a key into the first one, keeping first-seen order', () => {
    const rows = ['a1', 'b1', 'a2', 'c1', 'a3'];
    const groups = groupIdentical(rows, (row) => row[0]!);
    expect(groups.map((g) => [g.first, g.members])).toEqual([
      ['a1', ['a1', 'a2', 'a3']],
      ['b1', ['b1']],
      ['c1', ['c1']],
    ]);
  });

  it('returns no groups for no rows', () => {
    expect(groupIdentical([], () => 'x')).toEqual([]);
  });
});
