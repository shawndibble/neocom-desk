import { describe, it, expect } from 'vitest';
import { flattenAssetRows, nodeSegment } from './assetRows';
import type { AssetTreeNode, AssetTreeStation, EngineAsset } from '@/engine/assetTree';

function asset(overrides: Partial<EngineAsset> & { item_id: number }): EngineAsset {
  return {
    type_id: 34,
    quantity: 1,
    location_id: 0,
    location_type: 'item',
    location_flag: 'Hangar',
    ...overrides,
  };
}

function item(itemId: number): AssetTreeNode {
  return { kind: 'item', asset: asset({ item_id: itemId }) };
}

function bay(
  bayKind: 'cargoHold' | 'droneBay' | 'fitting',
  children: AssetTreeNode[]
): AssetTreeNode {
  return { kind: 'bay', bay: bayKind, children, itemCount: children.length, estimatedValue: 0 };
}

function container(itemId: number, children: AssetTreeNode[]): AssetTreeNode {
  return {
    kind: 'container',
    asset: asset({ item_id: itemId }),
    children,
    itemCount: children.length,
    estimatedValue: 0,
  };
}

function station(locationId: number, children: AssetTreeNode[]): AssetTreeStation {
  return {
    locationId,
    locationType: 'station',
    children,
    itemCount: children.length,
    estimatedValue: 0,
  };
}

describe('nodeSegment', () => {
  it('keys a bay by its bay kind', () => {
    expect(nodeSegment(bay('cargoHold', []))).toBe('b:cargoHold');
  });

  it('keys an item/container/ship by its item id', () => {
    expect(nodeSegment(item(42))).toBe('i:42');
  });
});

describe('flattenAssetRows', () => {
  it('emits one station row per station, even with no children', () => {
    const rows = flattenAssetRows([station(1, []), station(2, [])], new Set());
    expect(rows).toEqual([
      {
        type: 'station',
        key: 'station:1',
        station: expect.objectContaining({ locationId: 1 }),
        level: 1,
        posinset: 1,
        setsize: 2,
      },
      {
        type: 'station',
        key: 'station:2',
        station: expect.objectContaining({ locationId: 2 }),
        level: 1,
        posinset: 2,
        setsize: 2,
      },
    ]);
  });

  it('collapses a station to just its header row by default', () => {
    const tree = [station(1, [container(10, [item(11)])])];
    const rows = flattenAssetRows(tree, new Set());
    expect(rows.map((r) => r.key)).toEqual(['station:1']);
  });

  it('includes top-level node rows but not their children once the station key is expanded', () => {
    const tree = [station(1, [container(10, [item(11)])])];
    const rows = flattenAssetRows(tree, new Set(['station:1']));
    expect(rows.map((r) => r.key)).toEqual(['station:1', 'station:1/i:10']);
  });

  it('reveals children once both the station and branch keys are in expandedKeys', () => {
    const tree = [station(1, [container(10, [item(11)])])];
    const rows = flattenAssetRows(tree, new Set(['station:1', 'station:1/i:10']));
    expect(rows.map((r) => r.key)).toEqual(['station:1', 'station:1/i:10', 'station:1/i:10/i:11']);
    const childRow = rows[2];
    expect(childRow.type).toBe('node');
    if (childRow.type === 'node') expect(childRow.depth).toBe(1);
  });

  it('never expands an item row, regardless of expandedKeys', () => {
    const tree = [station(1, [item(10)])];
    const rows = flattenAssetRows(tree, new Set(['station:1', 'station:1/i:10']));
    expect(rows.map((r) => r.key)).toEqual(['station:1', 'station:1/i:10']);
  });

  it('expands a bay independently of its sibling bays', () => {
    const tree = [
      station(1, [container(10, [bay('cargoHold', [item(11)]), bay('droneBay', [item(12)])])]),
    ];
    const rows = flattenAssetRows(
      tree,
      new Set(['station:1', 'station:1/i:10', 'station:1/i:10/b:cargoHold'])
    );
    expect(rows.map((r) => r.key)).toEqual([
      'station:1',
      'station:1/i:10',
      'station:1/i:10/b:cargoHold',
      'station:1/i:10/b:cargoHold/i:11',
      'station:1/i:10/b:droneBay',
    ]);
  });

  it('keeps every station in one continuous row list, in the order given', () => {
    const tree = [station(2, [item(20)]), station(1, [item(10)])];
    const rows = flattenAssetRows(tree, new Set(['station:2', 'station:1']));
    expect(rows.map((r) => r.key)).toEqual([
      'station:2',
      'station:2/i:20',
      'station:1',
      'station:1/i:10',
    ]);
  });

  it('tags every node row with the owning station location id', () => {
    const tree = [station(1, [container(10, [item(11)])])];
    const rows = flattenAssetRows(tree, new Set(['station:1', 'station:1/i:10']));
    for (const row of rows) {
      if (row.type === 'node') expect(row.stationLocationId).toBe(1);
    }
  });

  it('stamps aria-level and 1-based sibling position/count on node rows', () => {
    const tree = [station(1, [container(10, [item(11), item(12)])])];
    const rows = flattenAssetRows(tree, new Set(['station:1', 'station:1/i:10']));
    const container10 = rows.find((r) => r.key === 'station:1/i:10');
    const item11 = rows.find((r) => r.key === 'station:1/i:10/i:11');
    const item12 = rows.find((r) => r.key === 'station:1/i:10/i:12');
    expect(container10).toMatchObject({ level: 2, posinset: 1, setsize: 1 });
    expect(item11).toMatchObject({ level: 3, posinset: 1, setsize: 2 });
    expect(item12).toMatchObject({ level: 3, posinset: 2, setsize: 2 });
  });
});
