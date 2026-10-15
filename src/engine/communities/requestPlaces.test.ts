import { describe, expect, it } from 'vitest';
import {
  buildPlaceIndex,
  jumpsToPlace,
  regionPlaceText,
  resolvePlace,
  searchPlaces,
  systemPlaceText,
} from './requestPlaces';

const index = buildPlaceIndex(
  [
    { id: 1, name: 'Jita', regionId: 100 },
    { id: 2, name: 'Perimeter', regionId: 100 },
    { id: 3, name: 'Badivefi', regionId: 200 },
    { id: 4, name: 'Efa', regionId: 200 },
    { id: 5, name: 'Amarr', regionId: 300 },
  ],
  [
    { id: 100, name: 'The Forge' },
    { id: 200, name: 'Khanid' },
    { id: 300, name: 'Domain' },
  ]
);

describe('resolvePlace', () => {
  it('reads a system name, ignoring case and spaces', () => {
    expect(resolvePlace('  jita ', index)).toEqual({ kind: 'system', systemId: 1 });
  });

  it('reads "System, Region" as the system', () => {
    expect(resolvePlace('Badivefi, Khanid', index)).toEqual({ kind: 'system', systemId: 3 });
    expect(
      resolvePlace(systemPlaceText({ id: 4, name: 'Efa', regionId: 200 }, 'Khanid'), index)
    ).toEqual({ kind: 'system', systemId: 4 });
  });

  it('reads "Region (region)" and a bare region name as the region', () => {
    expect(resolvePlace('Khanid (region)', index)).toEqual({ kind: 'region', regionId: 200 });
    expect(resolvePlace(regionPlaceText('The Forge'), index)).toEqual({
      kind: 'region',
      regionId: 100,
    });
    expect(resolvePlace('khanid', index)).toEqual({ kind: 'region', regionId: 200 });
  });

  it('prefers a system over a region of the same bare name, and the suffix forces the region', () => {
    const clash = buildPlaceIndex(
      [{ id: 9, name: 'Domain', regionId: 300 }],
      [{ id: 300, name: 'Domain' }]
    );
    expect(resolvePlace('Domain', clash)).toEqual({ kind: 'system', systemId: 9 });
    expect(resolvePlace('Domain (region)', clash)).toEqual({ kind: 'region', regionId: 300 });
  });

  it('returns null for free text it cannot place', () => {
    expect(resolvePlace('', index)).toBeNull();
    expect(resolvePlace('my hangar in 4-HWWF', index)).toBeNull();
    expect(resolvePlace('Amarr (region)', index)).toBeNull();
  });
});

describe('searchPlaces', () => {
  it('lists prefix matches first, then shorter names, and stops at the limit', () => {
    const found = searchPlaces('ba', index, 5);
    expect(found.map((p) => p.text)).toEqual(['Badivefi, Khanid']);
    // A prefix beats a mid-name match; then the shorter name.
    expect(searchPlaces('d', index, 5).map((p) => p.text)).toEqual([
      'Domain (region)',
      'Khanid (region)',
      'Badivefi, Khanid',
    ]);
    expect(searchPlaces('a', index, 2)).toHaveLength(2);
  });

  it('needs something to search for', () => {
    expect(searchPlaces('  ', index, 5)).toEqual([]);
  });
});

describe('jumpsToPlace', () => {
  const distances = new Map([
    [1, 7],
    [2, 6],
    [3, 0],
    [4, 2],
  ]);

  it('is the system’s own distance', () => {
    expect(jumpsToPlace({ kind: 'system', systemId: 2 }, distances, index)).toBe(6);
  });

  it('is the nearest reachable system of a region', () => {
    expect(jumpsToPlace({ kind: 'region', regionId: 100 }, distances, index)).toBe(6);
    expect(jumpsToPlace({ kind: 'region', regionId: 200 }, distances, index)).toBe(0);
  });

  it('is null when nothing there is reachable by stargate', () => {
    expect(jumpsToPlace({ kind: 'system', systemId: 5 }, distances, index)).toBeNull();
    expect(jumpsToPlace({ kind: 'region', regionId: 300 }, distances, index)).toBeNull();
  });
});
