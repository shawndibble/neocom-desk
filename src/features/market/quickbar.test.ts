import { describe, it, expect } from 'vitest';
import {
  addQuickbarItem,
  removeQuickbarItem,
  reorderQuickbarItems,
  setQuickbarItemTarget,
} from './quickbar';

describe('addQuickbarItem', () => {
  it('appends a new item', () => {
    expect(
      addQuickbarItem([{ typeId: 1, name: 'Tritanium' }], { typeId: 2, name: 'Rifter' })
    ).toEqual([
      { typeId: 1, name: 'Tritanium' },
      { typeId: 2, name: 'Rifter' },
    ]);
  });

  it('does not duplicate an item already present', () => {
    const items = [{ typeId: 1, name: 'Tritanium' }];
    expect(addQuickbarItem(items, { typeId: 1, name: 'Tritanium' })).toEqual(items);
  });

  it('does not mutate the input array', () => {
    const items = [{ typeId: 1, name: 'Tritanium' }];
    addQuickbarItem(items, { typeId: 2, name: 'Rifter' });
    expect(items).toEqual([{ typeId: 1, name: 'Tritanium' }]);
  });
});

describe('removeQuickbarItem', () => {
  it('removes the matching item', () => {
    const items = [
      { typeId: 1, name: 'Tritanium' },
      { typeId: 2, name: 'Rifter' },
    ];
    expect(removeQuickbarItem(items, 1)).toEqual([{ typeId: 2, name: 'Rifter' }]);
  });

  it('is a no-op when the typeId is not present', () => {
    const items = [{ typeId: 1, name: 'Tritanium' }];
    expect(removeQuickbarItem(items, 999)).toEqual(items);
  });
});

describe('reorderQuickbarItems', () => {
  const items = [
    { typeId: 1, name: 'A' },
    { typeId: 2, name: 'B' },
    { typeId: 3, name: 'C' },
  ];

  it('moves an item to sit at another item position', () => {
    expect(reorderQuickbarItems(items, 1, 3)).toEqual([
      { typeId: 2, name: 'B' },
      { typeId: 3, name: 'C' },
      { typeId: 1, name: 'A' },
    ]);
  });

  it('moves an item backwards', () => {
    expect(reorderQuickbarItems(items, 3, 1)).toEqual([
      { typeId: 3, name: 'C' },
      { typeId: 1, name: 'A' },
      { typeId: 2, name: 'B' },
    ]);
  });

  it('returns an equivalent list when either id is unknown', () => {
    expect(reorderQuickbarItems(items, 1, 999)).toEqual(items);
    expect(reorderQuickbarItems(items, 999, 1)).toEqual(items);
  });
});

describe('setQuickbarItemTarget', () => {
  const items = [
    { typeId: 1, name: 'Tritanium' },
    { typeId: 2, name: 'Rifter' },
  ];

  it('sets a target price and direction on the matching item', () => {
    expect(setQuickbarItemTarget(items, 1, { price: 5, direction: 'above' })).toEqual([
      { typeId: 1, name: 'Tritanium', targetPrice: 5, targetDirection: 'above' },
      { typeId: 2, name: 'Rifter' },
    ]);
  });

  it('clears an existing target when given null', () => {
    const withTarget = [
      { typeId: 1, name: 'Tritanium', targetPrice: 5, targetDirection: 'above' as const },
      { typeId: 2, name: 'Rifter' },
    ];
    expect(setQuickbarItemTarget(withTarget, 1, null)).toEqual([
      { typeId: 1, name: 'Tritanium' },
      { typeId: 2, name: 'Rifter' },
    ]);
  });

  it('replaces an existing target rather than merging it', () => {
    const withTarget = [
      { typeId: 1, name: 'Tritanium', targetPrice: 5, targetDirection: 'above' as const },
    ];
    expect(setQuickbarItemTarget(withTarget, 1, { price: 10, direction: 'below' })).toEqual([
      { typeId: 1, name: 'Tritanium', targetPrice: 10, targetDirection: 'below' },
    ]);
  });

  it('is a no-op when the typeId is not present', () => {
    expect(setQuickbarItemTarget(items, 999, { price: 5, direction: 'above' })).toEqual(items);
  });

  it('does not mutate the input array', () => {
    setQuickbarItemTarget(items, 1, { price: 5, direction: 'above' });
    expect(items).toEqual([
      { typeId: 1, name: 'Tritanium' },
      { typeId: 2, name: 'Rifter' },
    ]);
  });
});
