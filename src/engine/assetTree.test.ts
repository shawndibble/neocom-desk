import { describe, it, expect } from 'vitest';
import {
  buildAssetTree,
  compareStations,
  type AssetTreeContainerNode,
  type AssetTreeStation,
  type EngineAsset,
  type StationSortContext,
} from './assetTree';
import type { JumpsAwayResult } from './jumpsAway';

const asset = (overrides: Partial<EngineAsset> & Pick<EngineAsset, 'item_id'>): EngineAsset => ({
  type_id: 34,
  quantity: 1,
  location_id: 60003760,
  location_type: 'station',
  location_flag: 'Hangar',
  ...overrides,
});

describe('buildAssetTree', () => {
  it('returns nothing for an empty asset list', () => {
    expect(buildAssetTree([])).toEqual([]);
  });

  it('groups a flat hangar item under its station', () => {
    const tree = buildAssetTree([asset({ item_id: 1, quantity: 500, type_id: 34 })]);

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      locationId: 60003760,
      locationType: 'station',
      itemCount: 500,
    });
    expect(tree[0].children).toEqual([
      { kind: 'item', asset: expect.objectContaining({ item_id: 1 }) },
    ]);
  });

  it('prices a leaf item from the supplied price map, treating an unpriced type as worthless', () => {
    const priced = buildAssetTree(
      [asset({ item_id: 1, quantity: 10, type_id: 34 })],
      new Map([[34, 5]])
    );
    expect(priced[0].estimatedValue).toBe(50);

    const unpriced = buildAssetTree([asset({ item_id: 1, quantity: 10, type_id: 34 })]);
    expect(unpriced[0].estimatedValue).toBe(0);
  });

  it('classifies a singleton with Cargo/DroneBay/fitting-slot children as a ship, bucketed into named bays', () => {
    const tree = buildAssetTree([
      asset({ item_id: 10, type_id: 650, location_id: 60003760, location_flag: 'Hangar' }),
      asset({
        item_id: 11,
        type_id: 34,
        quantity: 50,
        location_id: 10,
        location_type: 'item',
        location_flag: 'Cargo',
      }),
      asset({
        item_id: 12,
        type_id: 35,
        quantity: 3,
        location_id: 10,
        location_type: 'item',
        location_flag: 'DroneBay',
      }),
      asset({
        item_id: 13,
        type_id: 2454,
        location_id: 10,
        location_type: 'item',
        location_flag: 'HiSlot0',
      }),
    ]);

    const ship = tree[0].children[0] as AssetTreeContainerNode;
    expect(ship.kind).toBe('ship');
    expect(ship.asset.item_id).toBe(10);
    expect(ship.children).toHaveLength(3);
    expect(ship.children.map((c) => (c as { bay?: string }).bay).sort()).toEqual([
      'cargoHold',
      'droneBay',
      'fitting',
    ]);
    // Self-exclusion: the ship's own badge is its contents only, not its own hull.
    expect(ship.itemCount).toBe(50 + 3 + 1);
  });

  it('omits empty bays — a ship with only cargo shows no drone/fitting sub-nodes', () => {
    const tree = buildAssetTree([
      asset({ item_id: 10, type_id: 650, location_flag: 'Hangar' }),
      asset({
        item_id: 11,
        type_id: 34,
        quantity: 1,
        location_id: 10,
        location_type: 'item',
        location_flag: 'Cargo',
      }),
    ]);
    const ship = tree[0].children[0] as AssetTreeContainerNode;
    expect(ship.children).toHaveLength(1);
    expect((ship.children[0] as { bay?: string }).bay).toBe('cargoHold');
  });

  it('classifies a singleton with no ship-bay-flagged children as a plain container, without bay bucketing', () => {
    const tree = buildAssetTree([
      asset({ item_id: 20, type_id: 17364, location_flag: 'Hangar' }),
      asset({
        item_id: 21,
        type_id: 34,
        quantity: 7,
        location_id: 20,
        location_type: 'item',
        location_flag: 'Unlocked',
      }),
    ]);
    const container = tree[0].children[0] as AssetTreeContainerNode;
    expect(container.kind).toBe('container');
    expect(container.children).toEqual([
      { kind: 'item', asset: expect.objectContaining({ item_id: 21 }) },
    ]);
  });

  it('nests containers to arbitrary depth', () => {
    const tree = buildAssetTree([
      asset({ item_id: 1, type_id: 17364, location_flag: 'Hangar' }),
      asset({
        item_id: 2,
        type_id: 17364,
        location_id: 1,
        location_type: 'item',
        location_flag: 'Unlocked',
      }),
      asset({
        item_id: 3,
        type_id: 34,
        quantity: 9,
        location_id: 2,
        location_type: 'item',
        location_flag: 'Unlocked',
      }),
    ]);
    const outer = tree[0].children[0] as AssetTreeContainerNode;
    const inner = outer.children[0] as AssetTreeContainerNode;
    expect(inner.kind).toBe('container');
    expect(inner.children).toEqual([
      { kind: 'item', asset: expect.objectContaining({ item_id: 3 }) },
    ]);
    // The outer badge counts the inner container itself (qty 1) plus the leaf inside it (qty 9).
    expect(outer.itemCount).toBe(10);
  });

  it('leaves an unrecognized flag under a ship as a direct child rather than dropping it', () => {
    const tree = buildAssetTree([
      asset({ item_id: 10, type_id: 650, location_flag: 'Hangar' }),
      asset({
        item_id: 11,
        type_id: 34,
        quantity: 1,
        location_id: 10,
        location_type: 'item',
        location_flag: 'Cargo',
      }),
      asset({
        item_id: 12,
        type_id: 35,
        quantity: 1,
        location_id: 10,
        location_type: 'item',
        location_flag: 'Wardrobe',
      }),
    ]);
    const ship = tree[0].children[0] as AssetTreeContainerNode;
    expect(ship.children).toHaveLength(2);
    expect(ship.children.some((c) => c.kind === 'item' && c.asset.item_id === 12)).toBe(true);
  });

  it("a station's badge includes a nested ship's own hull, not just the ship's contents", () => {
    const tree = buildAssetTree(
      [
        asset({ item_id: 10, type_id: 650, location_flag: 'Hangar' }),
        asset({
          item_id: 11,
          type_id: 34,
          quantity: 1,
          location_id: 10,
          location_type: 'item',
          location_flag: 'Cargo',
        }),
      ],
      new Map([
        [650, 1000],
        [34, 1],
      ])
    );
    expect(tree[0].estimatedValue).toBe(1001);
  });

  it('conserves total quantity: the sum of every station badge equals the sum across the flat input', () => {
    const assets = [
      asset({ item_id: 1, type_id: 34, quantity: 500, location_id: 60003760 }),
      asset({ item_id: 2, type_id: 650, quantity: 1, location_id: 60003760 }),
      asset({
        item_id: 3,
        type_id: 34,
        quantity: 20,
        location_id: 2,
        location_type: 'item',
        location_flag: 'Cargo',
      }),
      asset({ item_id: 4, type_id: 17364, quantity: 1, location_id: 60003760 }),
      asset({
        item_id: 5,
        type_id: 35,
        quantity: 4,
        location_id: 4,
        location_type: 'item',
        location_flag: 'Unlocked',
      }),
      asset({
        item_id: 6,
        type_id: 35,
        quantity: 12,
        location_id: 1000000000001,
        location_type: 'other',
      }),
    ];
    const totalQuantity = assets.reduce((sum, a) => sum + a.quantity, 0);
    const tree = buildAssetTree(assets);
    const grandTotal = tree.reduce((sum, station) => sum + station.itemCount, 0);
    expect(grandTotal).toBe(totalQuantity);
  });

  it('cuts a reachable cycle instead of recursing forever', () => {
    // A claims to be a top-level orphan container holding B; B claims to hold A back.
    const assets = [
      asset({
        item_id: 1,
        type_id: 17364,
        location_id: 999999999,
        location_type: 'item',
        location_flag: 'Unlocked',
      }),
      asset({
        item_id: 2,
        type_id: 17364,
        location_id: 1,
        location_type: 'item',
        location_flag: 'Unlocked',
      }),
    ];
    (assets[0] as { location_id: number }).location_id = 2;

    let tree: ReturnType<typeof buildAssetTree> = [];
    expect(() => {
      tree = buildAssetTree(assets);
    }).not.toThrow();

    expect(tree).toHaveLength(1);
    const outer = tree[0].children[0] as AssetTreeContainerNode;
    expect(outer.kind).toBe('container');
    const inner = outer.children[0] as AssetTreeContainerNode;
    expect(inner.kind).toBe('container');
    // The cycle is cut here: this leaf points back to `outer`'s own asset instead of recursing.
    expect(inner.children).toEqual([
      { kind: 'item', asset: expect.objectContaining({ item_id: outer.asset.item_id }) },
    ]);
  });
});

describe('compareStations', () => {
  const station = (
    overrides: Partial<AssetTreeStation> & Pick<AssetTreeStation, 'locationId'>
  ) => ({
    locationType: 'station' as const,
    children: [],
    itemCount: 0,
    estimatedValue: 0,
    ...overrides,
  });

  const labels = new Map<number, string>();
  const jumps = new Map<number, JumpsAwayResult>();
  const pinned = new Set<number>();

  function makeContext(): StationSortContext {
    return {
      labelFor: (s) => labels.get(s.locationId) ?? String(s.locationId),
      pinnedFor: (s) => pinned.has(s.locationId),
      jumpsAwayFor: (s) => jumps.get(s.locationId),
    };
  }

  function reset() {
    labels.clear();
    jumps.clear();
    pinned.clear();
  }

  it('sorts by name ascending', () => {
    reset();
    labels.set(1, 'Jita IV - Moon 4');
    labels.set(2, 'Amarr VIII');
    const stations = [station({ locationId: 1 }), station({ locationId: 2 })];
    const sorted = [...stations].sort((a, b) => compareStations(a, b, 'name', makeContext()));
    expect(sorted.map((s) => s.locationId)).toEqual([2, 1]);
  });

  it('sorts by estimated value, highest first', () => {
    reset();
    const stations = [
      station({ locationId: 1, estimatedValue: 100 }),
      station({ locationId: 2, estimatedValue: 5_000 }),
    ];
    const sorted = [...stations].sort((a, b) => compareStations(a, b, 'value', makeContext()));
    expect(sorted.map((s) => s.locationId)).toEqual([2, 1]);
  });

  it('sorts by item count, highest first', () => {
    reset();
    const stations = [
      station({ locationId: 1, itemCount: 3 }),
      station({ locationId: 2, itemCount: 40 }),
    ];
    const sorted = [...stations].sort((a, b) => compareStations(a, b, 'itemCount', makeContext()));
    expect(sorted.map((s) => s.locationId)).toEqual([2, 1]);
  });

  it('sorts by jumps-away ascending, with unknown distances sorted last', () => {
    reset();
    jumps.set(1, { kind: 'unknown', reason: 'noRoute' });
    jumps.set(2, { kind: 'known', jumps: 5 });
    jumps.set(3, { kind: 'known', jumps: 1 });
    const stations = [
      station({ locationId: 1 }),
      station({ locationId: 2 }),
      station({ locationId: 3 }),
    ];
    const sorted = [...stations].sort((a, b) => compareStations(a, b, 'jumpsAway', makeContext()));
    expect(sorted.map((s) => s.locationId)).toEqual([3, 2, 1]);
  });

  it('treats a missing jumps-away lookup the same as unknown', () => {
    reset();
    jumps.set(2, { kind: 'known', jumps: 2 });
    const stations = [station({ locationId: 1 }), station({ locationId: 2 })];
    const sorted = [...stations].sort((a, b) => compareStations(a, b, 'jumpsAway', makeContext()));
    expect(sorted.map((s) => s.locationId)).toEqual([2, 1]);
  });

  it.each(['name', 'value', 'itemCount', 'jumpsAway'] as const)(
    "keeps a pinned station first regardless of the %s field, even if it loses that field's comparison",
    (field) => {
      reset();
      pinned.add(1);
      labels.set(1, 'Zzz Unpinned-losing station');
      labels.set(2, 'Aaa');
      jumps.set(1, { kind: 'known', jumps: 99 });
      jumps.set(2, { kind: 'known', jumps: 1 });
      const stations = [
        station({ locationId: 1, estimatedValue: 1, itemCount: 1 }),
        station({ locationId: 2, estimatedValue: 9_999, itemCount: 9_999 }),
      ];
      const sorted = [...stations].sort((a, b) => compareStations(a, b, field, makeContext()));
      expect(sorted.map((s) => s.locationId)).toEqual([1, 2]);
    }
  );
});
