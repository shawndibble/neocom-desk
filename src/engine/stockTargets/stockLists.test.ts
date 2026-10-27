import { describe, expect, it } from 'vitest';
import {
  addMissingStockTargets,
  addStockList,
  MAX_STOCK_TARGET,
  parseStockLists,
  removeStockList,
  removeStockTarget,
  removeStockTargets,
  renameStockList,
  setStockListLocation,
  setStockTarget,
  type StockList,
} from './stockLists';

const efa: StockList = {
  id: 'a',
  name: 'Efa Market',
  locationId: 1035466617946,
  items: [{ typeId: 16242, target: 40 }],
};

describe('parseStockLists', () => {
  it('keeps every usable list and drops damaged ones', () => {
    expect(
      parseStockLists([
        efa,
        { id: '', name: 'No id', locationId: 1, items: [] },
        { id: 'b', name: '   ', locationId: 1, items: [] },
        { id: 'c', name: 'No market', locationId: null, items: [] },
        'junk',
      ])
    ).toEqual([efa]);
  });

  it('drops damaged Stock Targets but keeps the list', () => {
    const parsed = parseStockLists([
      {
        ...efa,
        items: [
          { typeId: 16242, target: 40 },
          { typeId: -1, target: 4 },
          { typeId: 34, target: 0 },
          { typeId: 35, target: 'x' },
          { typeId: 16242, target: 9 },
        ],
      },
    ]);
    expect(parsed?.[0].items).toEqual([{ typeId: 16242, target: 40 }]);
  });

  it('drops a list with no usable market', () => {
    expect(parseStockLists([{ id: 'a', name: 'X', items: [], locationId: 'nope' }])).toEqual([]);
  });

  it('is null for something that is not a list at all', () => {
    expect(parseStockLists({})).toBeNull();
  });
});

describe('list edits', () => {
  it('adds a list for a market with a trimmed name', () => {
    expect(addStockList([], { id: 'a', name: '  Efa Market ', locationId: 7 })).toEqual([
      { id: 'a', name: 'Efa Market', locationId: 7, items: [] },
    ]);
  });

  it('can start a list with Stock Targets, cleaned like a stored list', () => {
    const [list] = addStockList([], {
      id: 'a',
      name: 'Efa',
      locationId: 7,
      items: [
        { typeId: 34, target: 5 },
        { typeId: 34, target: 9 },
        { typeId: 35, target: 0 },
      ],
    });
    expect(list.items).toEqual([{ typeId: 34, target: 5 }]);
  });

  it('ignores a blank name on add and on rename', () => {
    expect(addStockList([], { id: 'a', name: ' ', locationId: 7 })).toEqual([]);
    expect(renameStockList([efa], 'a', '')).toEqual([efa]);
  });

  it('renames and removes by id', () => {
    expect(renameStockList([efa], 'a', 'Home')[0].name).toBe('Home');
    expect(removeStockList([efa], 'a')).toEqual([]);
  });

  it('keeps one market per station: a second list there, or a move onto one, is refused', () => {
    expect(addStockList([efa], { id: 'b', name: 'Again', locationId: efa.locationId })).toEqual([
      efa,
    ]);
    const other = { ...efa, id: 'b', name: 'Other', locationId: 9 };
    expect(setStockListLocation([efa, other], 'b', efa.locationId)).toEqual([efa, other]);
  });

  it('moves a list to another market', () => {
    expect(setStockListLocation([efa], 'a', 60003760)[0].locationId).toBe(60003760);
  });
});

describe('setStockTarget', () => {
  it('adds a new Stock Target at the end of the list', () => {
    const [list] = setStockTarget([efa], 'a', 34, 20000);
    expect(list.items).toEqual([
      { typeId: 16242, target: 40 },
      { typeId: 34, target: 20000 },
    ]);
  });

  it('replaces the quantity of an existing Stock Target in place', () => {
    expect(setStockTarget([efa], 'a', 16242, 55)[0].items).toEqual([{ typeId: 16242, target: 55 }]);
  });

  it('rounds to a whole quantity and caps it', () => {
    expect(setStockTarget([efa], 'a', 16242, 12.6)[0].items[0].target).toBe(13);
    expect(setStockTarget([efa], 'a', 16242, 1e15)[0].items[0].target).toBe(MAX_STOCK_TARGET);
  });

  it('removes the Stock Target when set to zero', () => {
    expect(setStockTarget([efa], 'a', 16242, 0)[0].items).toEqual([]);
    expect(removeStockTarget([efa], 'a', 16242)[0].items).toEqual([]);
  });

  it('leaves the value alone for an unknown list', () => {
    expect(setStockTarget([efa], 'zzz', 34, 5)).toEqual([efa]);
  });
});

describe('addMissingStockTargets', () => {
  it('adds only the items the list does not already have, keeping existing targets', () => {
    const [list] = addMissingStockTargets([efa], 'a', [
      { typeId: 16242, target: 1 },
      { typeId: 34, target: 500 },
    ]);
    expect(list.items).toEqual([
      { typeId: 16242, target: 40 },
      { typeId: 34, target: 500 },
    ]);
  });
});

describe('removeStockTargets', () => {
  const list: StockList = {
    ...efa,
    items: [
      { typeId: 1, target: 10 },
      { typeId: 2, target: 20 },
      { typeId: 3, target: 30 },
    ],
  };

  it('removes every named Stock Target in one edit and leaves the rest', () => {
    expect(removeStockTargets([list], 'a', [1, 3])[0].items).toEqual([{ typeId: 2, target: 20 }]);
  });

  it('leaves other lists alone and ignores ids the list does not have', () => {
    const other = { ...efa, id: 'b', locationId: 9 };
    const next = removeStockTargets([list, other], 'a', [99]);
    expect(next).toEqual([list, other]);
  });

  it('is undone by adding the removed targets back with their own quantities', () => {
    const removed = list.items.filter((item) => item.typeId !== 2);
    const after = removeStockTargets([list], 'a', [1, 3]);
    const restored = addMissingStockTargets(after, 'a', removed);
    expect(restored[0].items).toEqual(
      expect.arrayContaining([
        { typeId: 1, target: 10 },
        { typeId: 2, target: 20 },
        { typeId: 3, target: 30 },
      ])
    );
    expect(restored[0].items).toHaveLength(3);
  });
});
