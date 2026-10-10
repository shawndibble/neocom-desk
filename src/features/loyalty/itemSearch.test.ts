import { describe, expect, it } from 'vitest';
import {
  nearestStation,
  searchLpStores,
  type LpSnapshotStore,
} from '@/features/loyalty/itemSearch';

// Jumps from the Current System; 30000004 is unreachable (absent).
const JUMPS = new Map<number, number>([
  [30000001, 0],
  [30000002, 3],
  [30000003, 7],
]);

const STORES: LpSnapshotStore[] = [
  {
    corporationId: 1,
    systemIds: [30000003],
    offers: [[11, 34, 1000, 0, 100, []]],
  },
  {
    corporationId: 2,
    // Two stations: the nearer one (3 jumps) is the store's distance.
    systemIds: [30000003, 30000002],
    offers: [
      [21, 34, 500, 5000, 80, [[9, 1]]],
      [22, 587, 1, 0, 900, []],
    ],
  },
  {
    corporationId: 3,
    systemIds: [30000004],
    offers: [[31, 34, 1, 0, 1, []]],
  },
  {
    corporationId: 4,
    systemIds: [30000001],
    offers: [[41, 587, 1, 0, 1, []]],
  },
];

const CORPS = new Map([
  [1, 'Alpha Navy'],
  [2, 'Beta Union'],
  [3, 'Gamma Order'],
  [4, 'Delta Navy'],
]);
const ITEMS = new Map([
  [34, 'Tritanium'],
  [587, 'Rifter'],
  [9, 'Faction Tag'],
]);

describe('nearestStation', () => {
  it('picks the station system with the fewest jumps', () => {
    expect(nearestStation([30000003, 30000002], JUMPS)).toEqual({ systemId: 30000002, jumps: 3 });
  });

  it('skips unreachable systems and gives null when none is reachable', () => {
    expect(nearestStation([30000004, 30000003], JUMPS)).toEqual({ systemId: 30000003, jumps: 7 });
    expect(nearestStation([30000004], JUMPS)).toBeNull();
  });

  it('gives null without a distance map (no Current System yet)', () => {
    expect(nearestStation([30000001], null)).toBeNull();
  });
});

describe('searchLpStores', () => {
  const search = (query: string, jumps: ReadonlyMap<number, number> | null = JUMPS) =>
    searchLpStores({ stores: STORES, corporationNames: CORPS, itemNames: ITEMS, query, jumps });

  it('groups matching offers by item and sorts stores nearest first', () => {
    const { groups } = search('trit');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ typeId: 34, name: 'Tritanium' });
    expect(groups[0].stores.map((s) => [s.corporationId, s.jumps, s.nearestSystemId])).toEqual([
      [2, 3, 30000002],
      [1, 7, 30000003],
      [3, null, null],
    ]);
  });

  it('carries the offer in the shape the store view computes from', () => {
    const [first] = search('trit').groups[0].stores;
    expect(first.offer).toEqual({
      offer_id: 21,
      type_id: 34,
      quantity: 500,
      isk_cost: 5000,
      lp_cost: 80,
      required_items: [{ type_id: 9, quantity: 1 }],
    });
    expect(first.corporationName).toBe('Beta Union');
  });

  it('orders unreachable stores last, by name, when there is no distance map', () => {
    const { groups } = search('trit', null);
    expect(groups[0].stores.map((s) => s.corporationName)).toEqual([
      'Alpha Navy',
      'Beta Union',
      'Gamma Order',
    ]);
    expect(groups[0].stores.every((s) => s.jumps === null)).toBe(true);
  });

  it('matches a corporation by name and ranks the corporations by jumps', () => {
    const { corporations, groups } = search('navy');
    expect(groups).toEqual([]);
    expect(corporations.map((c) => [c.corporationId, c.jumps])).toEqual([
      [4, 0],
      [1, 7],
    ]);
  });

  it('caps the item groups and reports how many matched', () => {
    const result = searchLpStores({
      stores: STORES,
      corporationNames: CORPS,
      itemNames: ITEMS,
      query: 'i',
      jumps: JUMPS,
      groupLimit: 1,
    });
    expect(result.groups).toHaveLength(1);
    expect(result.totalItemMatches).toBe(2);
  });

  it('returns nothing for a blank query', () => {
    expect(search('  ')).toEqual({ groups: [], corporations: [], totalItemMatches: 0 });
  });
});

describe('searchLpStores corporation matches', () => {
  const names = new Map([
    [1000120, 'Federal Navy Academy'],
    [1000121, 'Federation Navy'],
    [1000122, 'Deep Core Mining'],
  ]);
  const find = (query: string, stores: LpSnapshotStore[] = []) =>
    searchLpStores({
      stores,
      corporationNames: names,
      itemNames: new Map(),
      query,
      jumps: null,
    }).corporations.map((corp) => corp.corporationName);

  it('finds a store by part of its name, case-insensitively', () => {
    expect(find('fed')).toEqual(['Federal Navy Academy', 'Federation Navy']);
  });

  it('matches corporations with no snapshot at all, without a distance', () => {
    const [hit] = searchLpStores({
      stores: [],
      corporationNames: names,
      itemNames: new Map(),
      query: 'deep',
      jumps: null,
    }).corporations;
    expect(hit).toEqual({
      corporationId: 1000122,
      corporationName: 'Deep Core Mining',
      nearestSystemId: null,
      jumps: null,
    });
  });
});
