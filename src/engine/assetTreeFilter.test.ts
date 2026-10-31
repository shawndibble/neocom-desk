import { describe, expect, it } from 'vitest';
import { buildAssetTree, type EngineAsset } from './assetTree';
import { pruneAssetTree } from './assetTreeFilter';

const asset = (
  over: Partial<EngineAsset> & Pick<EngineAsset, 'item_id' | 'type_id'>
): EngineAsset => ({
  quantity: 1,
  location_id: 60000001,
  location_type: 'station',
  location_flag: 'Hangar',
  ...over,
});

// Station 1: ship (type 10) holding ammo (type 20 x100) and a rifle (type 30) in cargo.
// Station 2: loose rifle (type 30).
const assets: EngineAsset[] = [
  asset({ item_id: 1, type_id: 10 }),
  asset({
    item_id: 2,
    type_id: 20,
    quantity: 100,
    location_id: 1,
    location_type: 'item',
    location_flag: 'Cargo',
  }),
  asset({ item_id: 3, type_id: 30, location_id: 1, location_type: 'item', location_flag: 'Cargo' }),
  asset({ item_id: 4, type_id: 30, location_id: 60000002 }),
];
const prices = new Map([
  [10, 1000],
  [20, 2],
  [30, 50],
]);

describe('pruneAssetTree', () => {
  const tree = buildAssetTree(assets, prices);

  it('keeps a match with its container path and totals only the matches', () => {
    const pruned = pruneAssetTree(tree, (a) => a.type_id === 20, prices, new Map());
    expect(pruned).toHaveLength(1);
    const [station] = pruned;
    expect(station.locationId).toBe(60000001);
    expect(station.itemCount).toBe(100);
    expect(station.estimatedValue).toBe(200);
    const [ship] = station.children;
    expect(ship.kind).toBe('ship');
    if (ship.kind === 'ship') {
      expect(ship.itemCount).toBe(100);
      expect(ship.children).toHaveLength(1);
    }
  });

  it('drops stations with no match', () => {
    const pruned = pruneAssetTree(tree, (a) => a.item_id === 4, prices, new Map());
    expect(pruned.map((s) => s.locationId)).toEqual([60000002]);
  });

  it('turns a kept container with nothing kept inside into a plain item', () => {
    const pruned = pruneAssetTree(tree, (a) => a.type_id === 10, prices, new Map());
    expect(pruned[0].children[0].kind).toBe('item');
    expect(pruned[0].estimatedValue).toBe(1000);
  });

  it('returns nothing when nothing matches', () => {
    expect(pruneAssetTree(tree, () => false, prices, new Map())).toEqual([]);
  });

  it('is a no-op in totals when everything matches', () => {
    const pruned = pruneAssetTree(tree, () => true, prices, new Map());
    expect(pruned.map((s) => s.estimatedValue)).toEqual(tree.map((s) => s.estimatedValue));
    expect(pruned.map((s) => s.itemCount)).toEqual(tree.map((s) => s.itemCount));
  });
});
