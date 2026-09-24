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

  it('starts on the Prices view', () => {
    expect(useCompareSet.getState().view).toBe('prices');
  });

  it('addMany appends new items in order and dedupes against the existing set', () => {
    useCompareSet.getState().add({ typeId: 34, itemName: 'Tritanium' });
    useCompareSet.getState().addMany([
      { typeId: 34, itemName: 'Tritanium' },
      { typeId: 35, itemName: 'Pyerite' },
      { typeId: 36, itemName: 'Mexallon' },
    ]);
    expect(useCompareSet.getState().items).toEqual([
      { typeId: 34, itemName: 'Tritanium' },
      { typeId: 35, itemName: 'Pyerite' },
      { typeId: 36, itemName: 'Mexallon' },
    ]);
  });

  it('addMany dedupes duplicates within the batch itself', () => {
    useCompareSet.getState().addMany([
      { typeId: 34, itemName: 'Tritanium' },
      { typeId: 34, itemName: 'Tritanium' },
    ]);
    expect(useCompareSet.getState().items).toHaveLength(1);
  });

  it('openIn sets the view and bumps openRequest', () => {
    const before = useCompareSet.getState().openRequest;
    useCompareSet.getState().openIn('attributes');
    expect(useCompareSet.getState().view).toBe('attributes');
    expect(useCompareSet.getState().openRequest).toBe(before + 1);
  });

  it('consumeOpenRequest clears the pending open without touching the view or items', () => {
    useCompareSet.getState().add({ typeId: 34, itemName: 'Tritanium' });
    useCompareSet.getState().openIn('attributes');
    useCompareSet.getState().consumeOpenRequest();
    expect(useCompareSet.getState().openRequest).toBe(0);
    expect(useCompareSet.getState().view).toBe('attributes');
    expect(useCompareSet.getState().items).toHaveLength(1);
  });

  it('setView changes the view without touching openRequest', () => {
    const before = useCompareSet.getState().openRequest;
    useCompareSet.getState().setView('attributes');
    expect(useCompareSet.getState().view).toBe('attributes');
    expect(useCompareSet.getState().openRequest).toBe(before);
  });

  it('clear resets the view to Prices and openRequest to 0', () => {
    useCompareSet.getState().add({ typeId: 34, itemName: 'Tritanium' });
    useCompareSet.getState().openIn('attributes');
    useCompareSet.getState().clear();
    expect(useCompareSet.getState().view).toBe('prices');
    expect(useCompareSet.getState().openRequest).toBe(0);
  });

  it('removing the last item resets the view to Prices and openRequest to 0', () => {
    useCompareSet.getState().add({ typeId: 34, itemName: 'Tritanium' });
    useCompareSet.getState().openIn('attributes');
    useCompareSet.getState().remove(34);
    expect(useCompareSet.getState().view).toBe('prices');
    expect(useCompareSet.getState().openRequest).toBe(0);
  });

  it('removing an item while others remain leaves the view and openRequest alone', () => {
    useCompareSet.getState().add({ typeId: 34, itemName: 'Tritanium' });
    useCompareSet.getState().add({ typeId: 35, itemName: 'Pyerite' });
    useCompareSet.getState().openIn('attributes');
    const before = useCompareSet.getState().openRequest;
    useCompareSet.getState().remove(34);
    expect(useCompareSet.getState().view).toBe('attributes');
    expect(useCompareSet.getState().openRequest).toBe(before);
  });
});
