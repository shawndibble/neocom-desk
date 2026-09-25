import { describe, expect, it } from 'vitest';
import { browserTree, classifyRuleBreaks, type CandidateEntry } from './candidates';

describe('classifyRuleBreaks', () => {
  it('passes an item that breaks nothing', () => {
    expect(classifyRuleBreaks([])).toEqual({ fitsHull: true, canFly: true, fitsResources: true });
  });

  it('tells an item too big for the bare hull’s CPU, powergrid or calibration apart from a hull break', () => {
    expect(classifyRuleBreaks(['resource'])).toEqual({
      fitsHull: true,
      canFly: true,
      fitsResources: false,
    });
  });

  it('flags a skill shortfall as not flyable, but still fitting the hull', () => {
    expect(classifyRuleBreaks(['skill'])).toEqual({
      fitsHull: true,
      canFly: false,
      fitsResources: true,
    });
  });

  it.each(['wrong_slot', 'slots', 'rig_size', 'ship_restricted', 'capital_item', 'max_group'])(
    'treats %s as not fitting the hull',
    (rule) => {
      expect(classifyRuleBreaks([rule]).fitsHull).toBe(false);
    }
  );
});

describe('browserTree', () => {
  // Ship Equipment ─┬─ Hull & Armor ── Armor Plates ─┬─ 100mm (items 1, 2)
  //                 │                                └─ 200mm (item 3)
  //                 └─ Propulsion ── Afterburners (item 4)
  // Drones ── Combat Drones ── Light (item 5)
  const groupsById = new Map([
    [1, { id: 1, name: 'Ship Equipment', parentId: null, hasTypes: false }],
    [2, { id: 2, name: 'Hull & Armor', parentId: 1, hasTypes: false }],
    [3, { id: 3, name: 'Armor Plates', parentId: 2, hasTypes: false }],
    [31, { id: 31, name: '100mm', parentId: 3, hasTypes: true }],
    [32, { id: 32, name: '200mm', parentId: 3, hasTypes: true }],
    [4, { id: 4, name: 'Propulsion', parentId: 1, hasTypes: false }],
    [41, { id: 41, name: 'Afterburners', parentId: 4, hasTypes: true }],
    [5, { id: 5, name: 'Drones', parentId: null, hasTypes: false }],
    [51, { id: 51, name: 'Combat Drones', parentId: 5, hasTypes: false }],
    [52, { id: 52, name: 'Light', parentId: 51, hasTypes: true }],
  ]);
  const items: CandidateEntry[] = [
    { typeId: 2, name: '100mm Steel Plates II', marketGroupId: 31 },
    { typeId: 1, name: '100mm Steel Plates I', marketGroupId: 31 },
    { typeId: 3, name: '200mm Steel Plates I', marketGroupId: 32 },
    { typeId: 4, name: '1MN Afterburner II', marketGroupId: 41 },
    { typeId: 5, name: 'Hobgoblin II', marketGroupId: 52 },
    { typeId: 9, name: 'Unknown group', marketGroupId: 999 },
  ];

  it('keeps the market hierarchy, counting what passes under each branch', () => {
    const tree = browserTree(items, () => true, groupsById);
    expect(tree.map((n) => [n.label, n.count])).toEqual([
      ['Drones · Combat Drones · Light', 1],
      ['Ship Equipment', 4],
    ]);
    const ship = tree[1];
    expect(ship.children.map((n) => n.label)).toEqual([
      'Hull & Armor · Armor Plates',
      'Propulsion · Afterburners',
    ]);
    const plates = ship.children[0];
    expect(plates.children.map((n) => [n.label, n.count])).toEqual([
      ['100mm', 2],
      ['200mm', 1],
    ]);
    expect(plates.children[0].items.map((e) => e.name)).toEqual([
      '100mm Steel Plates I',
      '100mm Steel Plates II',
    ]);
  });

  it('prunes branches with nothing that passes, merging the chains left behind', () => {
    const tree = browserTree(items, (e) => e.typeId === 3, groupsById);
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe('Ship Equipment · Hull & Armor · Armor Plates · 200mm');
    expect(tree[0].items.map((e) => e.typeId)).toEqual([3]);
    expect(tree[0].children).toEqual([]);
  });

  it('is empty when nothing passes', () => {
    expect(browserTree(items, () => false, groupsById)).toEqual([]);
  });
});
