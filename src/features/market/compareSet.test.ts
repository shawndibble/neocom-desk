import { describe, it, expect, beforeEach } from 'vitest';
import { useCompareSet } from './compareSet';

beforeEach(() => {
  useCompareSet.setState({ items: [] });
});

describe('useCompareSet', () => {
  it('starts empty', () => {
    expect(useCompareSet.getState().items).toEqual([]);
  });

  it('adds an item', () => {
    useCompareSet.getState().add({ typeId: 34, itemName: 'Tritanium' });
    expect(useCompareSet.getState().items).toEqual([{ typeId: 34, itemName: 'Tritanium' }]);
  });

  it('does not duplicate an item already in the set', () => {
    useCompareSet.getState().add({ typeId: 34, itemName: 'Tritanium' });
    useCompareSet.getState().add({ typeId: 34, itemName: 'Tritanium' });
    expect(useCompareSet.getState().items).toHaveLength(1);
  });

  it('removes an item by typeId', () => {
    useCompareSet.getState().add({ typeId: 34, itemName: 'Tritanium' });
    useCompareSet.getState().add({ typeId: 35, itemName: 'Pyerite' });
    useCompareSet.getState().remove(34);
    expect(useCompareSet.getState().items).toEqual([{ typeId: 35, itemName: 'Pyerite' }]);
  });

  it('clears the set', () => {
    useCompareSet.getState().add({ typeId: 34, itemName: 'Tritanium' });
    useCompareSet.getState().clear();
    expect(useCompareSet.getState().items).toEqual([]);
  });
});
