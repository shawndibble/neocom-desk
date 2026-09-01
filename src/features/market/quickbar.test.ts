import { describe, it, expect } from 'vitest';
import { addQuickbarItem, removeQuickbarItem, reorderQuickbarItems } from './quickbar';

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
