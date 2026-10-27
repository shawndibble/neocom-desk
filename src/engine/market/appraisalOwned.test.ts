import { describe, expect, it } from 'vitest';
import { ownedAnywhere, ownedAtPlace, ownedPlaces, subtractOwned } from './appraisalOwned';

let nextItemId = 1000;
const asset = (
  type_id: number,
  quantity: number,
  location_id: number,
  location_type: 'station' | 'item' | 'other' = 'station',
  location_flag = 'Hangar',
  item_id = nextItemId++
) => ({ item_id, type_id, quantity, location_id, location_type, location_flag });

describe('ownedAtPlace', () => {
  it('sums quantities per type across Characters at one station', () => {
    const owned = ownedAtPlace([[asset(34, 100, 1), asset(35, 5, 1)], [asset(34, 50, 1)]], 1);
    expect(owned.get(34)).toBe(150);
    expect(owned.get(35)).toBe(5);
  });

  it('ignores other stations', () => {
    expect(ownedAtPlace([[asset(34, 100, 2)]], 1).size).toBe(0);
  });

  it('counts an item in a container in a station hangar', () => {
    const owned = ownedAtPlace(
      [[asset(1, 1, 1, 'station', 'Hangar', 10), asset(34, 7, 10, 'item', 'Unlocked')]],
      1
    );
    expect(owned.get(34)).toBe(7);
  });

  it('counts an item in a container inside a container', () => {
    const owned = ownedAtPlace(
      [
        [
          asset(1, 1, 1, 'station', 'Hangar', 10),
          asset(1, 1, 10, 'item', 'Unlocked', 11),
          asset(34, 3, 11, 'item', 'Unlocked'),
        ],
      ],
      1
    );
    expect(owned.get(34)).toBe(3);
  });

  it('does not count a fitted module or ship cargo', () => {
    const owned = ownedAtPlace(
      [
        [
          asset(600, 1, 1, 'station', 'Hangar', 20),
          asset(34, 1, 20, 'item', 'HiSlot0'),
          asset(35, 9, 20, 'item', 'Cargo'),
          asset(36, 2, 20, 'item', 'DroneBay'),
        ],
      ],
      1
    );
    expect(owned.get(600)).toBe(1);
    expect(owned.has(34)).toBe(false);
    expect(owned.has(35)).toBe(false);
    expect(owned.has(36)).toBe(false);
  });

  it('does not count a container held in ship cargo', () => {
    const owned = ownedAtPlace(
      [
        [
          asset(600, 1, 1, 'station', 'Hangar', 20),
          asset(1, 1, 20, 'item', 'Cargo', 21),
          asset(34, 4, 21, 'item', 'Unlocked'),
        ],
      ],
      1
    );
    expect(owned.has(34)).toBe(false);
  });

  it('counts structure stock for a structure pick', () => {
    const owned = ownedAtPlace(
      [[asset(34, 8, 1_000_000_000_001, 'other'), asset(34, 5, 1)]],
      1_000_000_000_001
    );
    expect(owned.get(34)).toBe(8);
  });

  it('survives a parent loop and a missing parent', () => {
    const owned = ownedAtPlace(
      [
        [
          asset(1, 1, 31, 'item', 'Unlocked', 30),
          asset(1, 1, 30, 'item', 'Unlocked', 31),
          asset(34, 1, 999, 'item', 'Unlocked'),
        ],
      ],
      1
    );
    expect(owned.size).toBe(0);
  });
});

describe('ownedAnywhere', () => {
  it('counts stations, structures and containers but not fitted or ship-held rows', () => {
    const owned = ownedAnywhere([
      [
        asset(34, 1, 1),
        asset(34, 2, 5_000, 'other'),
        asset(1, 1, 1, 'station', 'Hangar', 10),
        asset(34, 4, 10, 'item', 'Unlocked'),
        asset(600, 1, 1, 'station', 'Hangar', 20),
        asset(34, 100, 20, 'item', 'HiSlot0'),
        asset(34, 200, 20, 'item', 'Cargo'),
      ],
    ]);
    expect(owned.get(34)).toBe(7);
  });

  it('sums two Characters', () => {
    expect(ownedAnywhere([[asset(34, 100, 1)], [asset(34, 50, 9)]]).get(34)).toBe(150);
  });
});

describe('ownedPlaces', () => {
  it('lists stations and structures holding stock, once each', () => {
    const places = ownedPlaces([
      [asset(34, 1, 1), asset(35, 1, 1), asset(34, 2, 5_000, 'other')],
      [asset(34, 1, 1)],
    ]);
    expect(places).toEqual([
      { id: 1, kind: 'station' },
      { id: 5_000, kind: 'structure' },
    ]);
  });

  it('skips a place that only holds fitted modules', () => {
    const places = ownedPlaces([
      [asset(600, 1, 1, 'station', 'Hangar', 20), asset(34, 1, 20, 'item', 'HiSlot0')],
    ]);
    expect(places).toEqual([{ id: 1, kind: 'station' }]);
  });
});

describe('subtractOwned', () => {
  const items = [
    { typeId: 34, quantity: 100 },
    { typeId: 35, quantity: 10 },
    { typeId: 36, quantity: 5 },
  ];

  it('subtracts a partial holding', () => {
    expect(subtractOwned(items, new Map([[34, 40]]))[0]).toEqual({
      typeId: 34,
      quantity: 100,
      owned: 40,
      need: 60,
    });
  });

  it('caps owned at the wanted quantity when fully covered', () => {
    const [, covered] = subtractOwned(items, new Map([[35, 99]]));
    expect(covered).toMatchObject({ owned: 10, need: 0 });
  });

  it('leaves need equal to quantity when nothing is owned', () => {
    const [, , none] = subtractOwned(items, new Map());
    expect(none).toMatchObject({ owned: 0, need: 5 });
  });
});
