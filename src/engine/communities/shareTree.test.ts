import { describe, expect, it } from 'vitest';
import {
  OTHER_GROUP_ID,
  blueprintGroupOfProductGroup,
  buildShareTree,
  countSelected,
  descendantTypeIds,
  filterShareTree,
  groupState,
  selectAll,
  toggleGroup,
  toggleType,
  type ShareGroup,
} from './shareTree';

const groups = [
  { id: 101, name: 'Ships', parentId: null, hasTypes: false },
  { id: 102, name: 'Frigates', parentId: 101, hasTypes: true },
  { id: 103, name: 'Cruisers', parentId: 101, hasTypes: true },
  { id: 104, name: 'Modules', parentId: null, hasTypes: true },
  { id: 105, name: 'Empty branch', parentId: null, hasTypes: true },
];
const owned = [
  { typeId: 10, name: 'Rifter Blueprint', marketGroupId: 102 },
  { typeId: 11, name: 'Merlin Blueprint', marketGroupId: 102 },
  { typeId: 12, name: 'Caracal Blueprint', marketGroupId: 103 },
  { typeId: 13, name: 'Small Armor Repairer I Blueprint', marketGroupId: 104 },
  { typeId: 14, name: 'Hammerhead II Blueprint', marketGroupId: null },
  { typeId: 15, name: 'Mystery Blueprint', marketGroupId: 999 },
];

function tree(): ShareGroup[] {
  return buildShareTree(owned, groups, 'Other');
}
const byName = (list: readonly ShareGroup[], name: string) => list.find((g) => g.name === name)!;

describe('buildShareTree', () => {
  it('nests owned types under their market group path and prunes empty groups', () => {
    const roots = tree();
    expect(roots.map((g) => g.name)).toEqual(['Modules', 'Ships', 'Other']);
    const ships = byName(roots, 'Ships');
    expect(ships.types).toEqual([]);
    expect(ships.children.map((g) => g.name)).toEqual(['Cruisers', 'Frigates']);
    expect(ships.total).toBe(3);
    expect(byName(ships.children, 'Frigates').types.map((t) => t.typeId)).toEqual([11, 10]);
  });

  it('puts blueprints with no (or an unknown) market group in a trailing Other bucket', () => {
    const other = byName(tree(), 'Other');
    expect(other.id).toBe(OTHER_GROUP_ID);
    expect(other.types.map((t) => t.typeId)).toEqual([14, 15]);
  });

  it('lists each type once even when ESI reports several copies', () => {
    const dup = buildShareTree([...owned, owned[0]], groups, 'Other');
    expect(byName(dup, 'Ships').total).toBe(3);
  });
});

describe('buildShareTree with the Blueprints & Reactions root', () => {
  const market = [
    { id: 2, name: 'Blueprints & Reactions', parentId: null },
    { id: 204, name: 'Ships', parentId: 2 },
    { id: 205, name: 'Frigates', parentId: 204 },
    { id: 209, name: 'Ship Equipment', parentId: 2 },
    { id: 4, name: 'Ships', parentId: null },
    { id: 5, name: 'Frigates', parentId: 4 },
    { id: 9, name: 'Ship Equipment', parentId: null },
    { id: 10, name: 'Mining Lasers', parentId: 9 },
    { id: 24, name: 'Implants & Boosters', parentId: null },
    { id: 25, name: 'Boosters', parentId: 24 },
    { id: 19, name: 'Trade Goods', parentId: null },
  ];
  const build = (types: Parameters<typeof buildShareTree>[0]) =>
    buildShareTree(types, market, 'Other');

  it('drops the root and keeps its children as roots', () => {
    const roots = build([{ typeId: 1, name: 'Rifter Blueprint', marketGroupId: 205 }]);
    expect(roots.map((g) => g.name)).toEqual(['Ships']);
    expect(roots[0].children.map((g) => g.name)).toEqual(['Frigates']);
  });

  it('places an unlisted blueprint by its product, adding groups the blueprint tree lacks', () => {
    const roots = build([
      { typeId: 2, name: 'Miner II Blueprint', marketGroupId: null, productMarketGroupId: 10 },
      { typeId: 3, name: 'Blue Pill Blueprint', marketGroupId: null, productMarketGroupId: 25 },
    ]);
    expect(roots.map((g) => g.name)).toEqual(['Implants & Boosters', 'Ship Equipment']);
    const lasers = byName(byName(roots, 'Ship Equipment').children, 'Mining Lasers');
    expect(lasers.types.map((t) => t.typeId)).toEqual([2]);
    expect(byName(byName(roots, 'Implants & Boosters').children, 'Boosters').types).toHaveLength(1);
  });

  it('puts an unlisted blueprint beside the listed ones that make the same kind of product', () => {
    const catalog = [
      { typeId: 6, name: 'Miner I Blueprint', marketGroupId: 209, productMarketGroupId: 10 },
      { typeId: 7, name: 'Miner II Blueprint', marketGroupId: null, productMarketGroupId: 10 },
    ];
    const learned = blueprintGroupOfProductGroup(catalog, market);
    expect(learned.get(10)).toBe(209);
    const roots = buildShareTree(catalog, market, 'Other', learned);
    expect(roots.map((g) => g.name)).toEqual(['Ship Equipment']);
    expect(roots[0].types.map((t) => t.typeId)).toEqual([6, 7]);
  });

  it('moves a blueprint filed outside the root (Trade Goods) under its product', () => {
    const roots = build([
      { typeId: 4, name: 'Stray Blueprint', marketGroupId: 19, productMarketGroupId: 5 },
    ]);
    expect(roots.map((g) => g.name)).toEqual(['Ships']);
    expect(byName(roots[0].children, 'Frigates').types.map((t) => t.typeId)).toEqual([4]);
  });

  it('never loses a blueprint filed in the removed root itself', () => {
    const roots = build([
      { typeId: 8, name: 'Rootless Blueprint', marketGroupId: 2, productMarketGroupId: 5 },
    ]);
    expect(roots.map((g) => g.name)).toEqual(['Ships']);
  });

  it('keeps Other for a blueprint whose product has no market group', () => {
    const roots = build([{ typeId: 5, name: 'Odd Blueprint', marketGroupId: null }]);
    expect(roots.map((g) => g.name)).toEqual(['Other']);
  });
});

describe('selection', () => {
  it('reads a group as none, some or all of its descendants', () => {
    const ships = byName(tree(), 'Ships');
    expect(groupState(ships, new Set())).toBe('none');
    expect(groupState(ships, new Set([10]))).toBe('some');
    expect(groupState(ships, new Set([10, 11, 12]))).toBe('all');
  });

  it('toggles a whole category: tops up a partial one, clears a full one', () => {
    const ships = byName(tree(), 'Ships');
    const topped = toggleGroup(ships, new Set([10, 13]));
    expect([...topped].sort()).toEqual([10, 11, 12, 13]);
    const cleared = toggleGroup(ships, topped);
    expect([...cleared]).toEqual([13]);
  });

  it('opts a single blueprint in or out without touching the rest', () => {
    const on = toggleType(new Set([10]), 11);
    expect([...on].sort()).toEqual([10, 11]);
    expect([...toggleType(on, 10)]).toEqual([11]);
  });

  it('shares all of what is owned, and counts only blueprints still owned', () => {
    expect(selectAll(owned).size).toBe(6);
    expect(countSelected(new Set([10, 11, 4242]), owned)).toBe(2);
  });

  it('collects every descendant type id of a group', () => {
    expect(descendantTypeIds(byName(tree(), 'Ships')).sort()).toEqual([10, 11, 12]);
  });
});

describe('filterShareTree', () => {
  it('keeps matching blueprints and the groups above them, ignoring case', () => {
    const found = filterShareTree(tree(), 'RIFT');
    expect(found.map((g) => g.name)).toEqual(['Ships']);
    expect(byName(found[0].children, 'Frigates').types.map((t) => t.typeId)).toEqual([10]);
    expect(found[0].total).toBe(1);
  });

  it('returns the whole tree for a blank query and nothing for no match', () => {
    expect(filterShareTree(tree(), '  ')).toHaveLength(3);
    expect(filterShareTree(tree(), 'zzzz')).toEqual([]);
  });

  it('a filtered group still toggles only what the filter shows', () => {
    const found = filterShareTree(tree(), 'merlin');
    const frigates = byName(found[0].children, 'Frigates');
    expect([...toggleGroup(frigates, new Set())]).toEqual([11]);
  });
});
