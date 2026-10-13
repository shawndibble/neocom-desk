import { describe, expect, it } from 'vitest';
import { sharedBlueprintRows } from './sharedBlueprintCopies';

const item = (typeId: number, locationName: string, systemName: string, runs = -1) => ({
  typeId,
  me: 10,
  te: 20,
  runs,
  locationName,
  systemName,
});

const libraries = [
  { uid: 'ann', items: [item(10, 'Jita IV', 'Jita'), item(11, 'Efa VII', 'Efa', 5)] },
  { uid: 'gone', items: [item(10, 'Amarr VIII', 'Amarr')] },
];
const members = [{ uid: 'ann', characterName: 'Ann', joinedAt: 1, libraryAsOf: 1 }];
const names = new Map([
  [10, 'Rifter Blueprint'],
  [11, 'Merlin Blueprint'],
]);

describe('sharedBlueprintRows', () => {
  it('gives one row per shared item, named, with its Member and staleness', () => {
    const rows = sharedBlueprintRows(libraries, members, names, new Set(['ann']), '');
    expect(rows).toEqual([
      expect.objectContaining({
        name: 'Rifter Blueprint',
        memberName: 'Ann',
        stale: true,
        runs: -1,
      }),
      expect.objectContaining({ name: 'Merlin Blueprint', systemName: 'Efa', runs: 5 }),
    ]);
  });

  it('leaves out a library whose Member is no longer listed', () => {
    const rows = sharedBlueprintRows(libraries, members, names, new Set(), '');
    expect(rows.some((row) => row.locationName === 'Amarr VIII')).toBe(false);
  });

  it('narrows by blueprint, Member, station or system', () => {
    const match = (query: string) =>
      sharedBlueprintRows(libraries, members, names, new Set(), query).map((row) => row.name);
    expect(match('merlin')).toEqual(['Merlin Blueprint']);
    expect(match('jita iv')).toEqual(['Rifter Blueprint']);
    expect(match('efa')).toEqual(['Merlin Blueprint']);
    expect(match('ann')).toHaveLength(2);
  });

  it('names an unknown type by its id', () => {
    const rows = sharedBlueprintRows(
      [{ uid: 'ann', items: [item(99, 'X', 'Y')] }],
      members,
      names,
      new Set(),
      ''
    );
    expect(rows[0].name).toBe('#99');
  });
});
