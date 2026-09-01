import { describe, it, expect } from 'vitest';
import { selectionStateForIds, toggleSelection, namesForSelection } from './assetSelection';

describe('selectionStateForIds', () => {
  it('is unchecked for an empty id list', () => {
    expect(selectionStateForIds([], new Set())).toBe('unchecked');
  });

  it('is unchecked when none of the ids are selected', () => {
    expect(selectionStateForIds([1, 2], new Set([3]))).toBe('unchecked');
  });

  it('is checked when every id is selected', () => {
    expect(selectionStateForIds([1, 2], new Set([1, 2, 3]))).toBe('checked');
  });

  it('is indeterminate when only some ids are selected', () => {
    expect(selectionStateForIds([1, 2], new Set([1]))).toBe('indeterminate');
  });
});

describe('toggleSelection', () => {
  it('selects every id when none are currently selected', () => {
    const next = toggleSelection(new Set(), [1, 2]);
    expect([...next].sort()).toEqual([1, 2]);
  });

  it('selects every id when only some are currently selected (fills in the indeterminate case)', () => {
    const next = toggleSelection(new Set([1]), [1, 2]);
    expect([...next].sort()).toEqual([1, 2]);
  });

  it('deselects every id when all are currently selected', () => {
    const next = toggleSelection(new Set([1, 2, 3]), [1, 2]);
    expect([...next].sort()).toEqual([3]);
  });

  it('does not mutate the input set', () => {
    const input = new Set([1]);
    toggleSelection(input, [1, 2]);
    expect([...input]).toEqual([1]);
  });

  it('is a no-op for an empty id list', () => {
    const next = toggleSelection(new Set([1]), []);
    expect([...next]).toEqual([1]);
  });
});

describe('namesForSelection', () => {
  const assetsByItemId = new Map([
    [1, { type_id: 34 }],
    [2, { type_id: 35 }],
  ]);
  const typeNames = new Map([[34, 'Tritanium']]);

  it('resolves each id to its type name, in id order', () => {
    expect(namesForSelection([1], assetsByItemId, typeNames)).toEqual(['Tritanium']);
  });

  it('falls back to "Type #<id>" when the type name is unknown', () => {
    expect(namesForSelection([2], assetsByItemId, typeNames)).toEqual(['Type #35']);
  });

  it('skips ids with no matching asset', () => {
    expect(namesForSelection([1, 999], assetsByItemId, typeNames)).toEqual(['Tritanium']);
  });
});
