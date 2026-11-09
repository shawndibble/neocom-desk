import { describe, expect, it } from 'vitest';
import type { AssetTreeItemNode, AssetTreeNode } from '@/engine/assetTree';
import { sortLevelItems, splitLevelNodes } from './assetLevelSort';

function item(id: number, quantity: number): AssetTreeItemNode {
  return {
    kind: 'item',
    asset: { item_id: id, type_id: id, quantity } as AssetTreeItemNode['asset'],
  };
}
const ship = { kind: 'ship', children: [] } as unknown as AssetTreeNode;
const bay = { kind: 'bay', children: [] } as unknown as AssetTreeNode;

const figures = {
  name: (n: AssetTreeItemNode) => `n${n.asset.item_id}`,
  volume: (n: AssetTreeItemNode) => (n.asset.item_id === 3 ? undefined : n.asset.item_id),
  value: (n: AssetTreeItemNode) => 100 - n.asset.item_id,
};

describe('splitLevelNodes', () => {
  it('puts ships, containers and bays apart from items, keeping order', () => {
    const a = item(1, 1);
    const b = item(2, 1);
    const { containers, items } = splitLevelNodes([a, ship, b, bay]);
    expect(containers).toEqual([ship, bay]);
    expect(items).toEqual([a, b]);
  });
});

describe('sortLevelItems', () => {
  const items = [item(1, 5), item(2, 50), item(3, 9)];
  const ids = (sort: Parameters<typeof sortLevelItems>[1]) =>
    sortLevelItems(items, sort, figures).map((n) => n.asset.item_id);

  it('keeps the incoming order without a sort', () => expect(ids(null)).toEqual([1, 2, 3]));
  it('sorts by quantity', () => {
    expect(ids({ columnId: 'quantity', direction: 'desc' })).toEqual([2, 3, 1]);
  });
  it('sorts by value', () => {
    expect(ids({ columnId: 'value', direction: 'asc' })).toEqual([3, 2, 1]);
  });
  it('sinks a missing volume to the end either way', () => {
    expect(ids({ columnId: 'volume', direction: 'asc' })).toEqual([1, 2, 3]);
    expect(ids({ columnId: 'volume', direction: 'desc' })).toEqual([2, 1, 3]);
  });
  it('sorts by name', () => {
    expect(ids({ columnId: 'name', direction: 'desc' })).toEqual([3, 2, 1]);
  });
});
