import { describe, expect, it } from 'vitest';
import { placeNamesSystem, sharedBlueprintRows, systemIdsByName } from './sharedBlueprintCopies';

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

describe('placeNamesSystem', () => {
  it('is true when the station or structure name starts with its system', () => {
    expect(placeNamesSystem('Jita IV - Moon 4 - Caldari Navy Assembly Plant', 'Jita')).toBe(true);
    expect(placeNamesSystem('efa - Home Fortizar', 'Efa')).toBe(true);
  });

  it('is false when the name does not start with its system', () => {
    expect(placeNamesSystem('Home Fortizar', 'Efa')).toBe(false);
    // Naming another system somewhere inside is not naming its own.
    expect(placeNamesSystem('Perimeter - Jita overflow', 'Jita')).toBe(false);
    // A longer word that merely begins with the system's name is not it.
    expect(placeNamesSystem('Jitanomics Trade Hub', 'Jita')).toBe(false);
    expect(placeNamesSystem('Efatopia Keepstar', 'Efa')).toBe(false);
  });

  it('is true for the bare system name, or the name then a space or " -"', () => {
    expect(placeNamesSystem('Efa', 'Efa')).toBe(true);
    expect(placeNamesSystem('Efa - Home', 'Efa')).toBe(true);
    expect(placeNamesSystem('Amarr VIII (Oris) - Emperor Family Academy', 'Amarr')).toBe(true);
  });
});

describe('systemIdsByName', () => {
  it('finds a system id by its name, ignoring case', () => {
    const ids = systemIdsByName([
      { id: 30000142, name: 'Jita' },
      { id: 30003070, name: 'Efa' },
    ]);
    expect(ids.get('jita')).toBe(30000142);
    expect(ids.get('efa')).toBe(30003070);
    expect(ids.get('amarr')).toBeUndefined();
  });
});
