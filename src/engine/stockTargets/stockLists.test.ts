import { describe, expect, it } from 'vitest';
import {
  addStockList,
  MAX_STOCK_TARGET,
  parseStockLists,
  removeStockList,
  removeStockTarget,
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
