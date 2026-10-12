import { describe, expect, it } from 'vitest';
import {
  OTHER_GROUP_ID,
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
  { id: 1, name: 'Ships', parentId: null, hasTypes: false },
  { id: 2, name: 'Frigates', parentId: 1, hasTypes: true },
  { id: 3, name: 'Cruisers', parentId: 1, hasTypes: true },
  { id: 4, name: 'Modules', parentId: null, hasTypes: true },
  { id: 5, name: 'Empty branch', parentId: null, hasTypes: true },
];
const owned = [
  { typeId: 10, name: 'Rifter Blueprint', marketGroupId: 2 },
  { typeId: 11, name: 'Merlin Blueprint', marketGroupId: 2 },
  { typeId: 12, name: 'Caracal Blueprint', marketGroupId: 3 },
  { typeId: 13, name: 'Small Armor Repairer I Blueprint', marketGroupId: 4 },
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
