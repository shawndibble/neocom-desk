import { describe, it, expect } from 'vitest';
import { parseAppraisalPaste } from '@/engine/market/appraisalPaste';
import {
  selectionStateForIds,
  toggleSelection,
  selectAll,
  namesForSelection,
  quantityLinesForSelection,
  selectionTotals,
} from './assetSelection';

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

describe('selectAll', () => {
  it('selects every id when none are currently selected', () => {
    expect([...selectAll(new Set(), [1, 2])].sort()).toEqual([1, 2]);
  });

  it('adds to an existing selection rather than replacing it', () => {
    expect([...selectAll(new Set([9]), [1, 2])].sort()).toEqual([1, 2, 9]);
  });

  it('is a no-op — never deselects — when every id is already selected', () => {
    expect([...selectAll(new Set([1, 2]), [1, 2])].sort()).toEqual([1, 2]);
  });

  it('does not mutate the input set', () => {
    const input = new Set([1]);
    selectAll(input, [1, 2]);
    expect([...input]).toEqual([1]);
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

describe('quantityLinesForSelection', () => {
  const assetsByItemId = new Map([
    [1, { type_id: 34, quantity: 1000 }],
    [2, { type_id: 34, quantity: 2500 }],
    [3, { type_id: 35, quantity: 1 }],
  ]);
  const typeNames = new Map([[34, 'Tritanium']]);

  it('sums quantities of the same type into one "Name xQty" line', () => {
    expect(quantityLinesForSelection([1, 2, 3], assetsByItemId, typeNames)).toEqual([
      'Tritanium x3500',
      'Type #35 x1',
    ]);
  });

  it('skips ids with no matching asset', () => {
    expect(quantityLinesForSelection([1, 999], assetsByItemId, typeNames)).toEqual([
      'Tritanium x1000',
    ]);
  });

  it('round-trips through the Appraisal paste parser', () => {
    const text = quantityLinesForSelection([1, 2], assetsByItemId, typeNames).join('\n');
    expect(parseAppraisalPaste(text).map((e) => [e.name, e.quantity])).toEqual([
      ['Tritanium', 3500],
    ]);
  });
});

describe('selectionTotals (#6165)', () => {
  const assets = new Map([
    [1, { item_id: 1, type_id: 34, quantity: 500, is_blueprint_copy: false }],
    [2, { item_id: 2, type_id: 35, quantity: 2, is_blueprint_copy: false }],
    [3, { item_id: 3, type_id: 999, quantity: 1, is_blueprint_copy: true }],
    [4, { item_id: 4, type_id: 47000, quantity: 1, is_blueprint_copy: false }],
  ]);
  const prices = new Map([
    [34, 5],
    [35, 100],
  ]);
  const volumes = new Map([
    [34, 0.01],
    [35, 2],
  ]);

  it('sums each selected stack at its own value and quantity × unit volume', () => {
    expect(selectionTotals([1, 2], assets, prices, new Map(), volumes)).toEqual({
      isk: 500 * 5 + 2 * 100,
      volume: 500 * 0.01 + 2 * 2,
      unpriced: 0,
    });
  });

  it('counts a stack with no value as unpriced and adds nothing for it', () => {
    expect(selectionTotals([1, 4], assets, prices, new Map(), volumes)).toEqual({
      isk: 2500,
      volume: 5,
      unpriced: 1,
    });
  });

  it('never counts a blueprint copy as unpriced: it is worth nothing by design', () => {
    expect(selectionTotals([1, 3], assets, prices, new Map(), volumes)).toEqual({
      isk: 2500,
      volume: 5,
      unpriced: 0,
    });
  });

  it('takes a per-item value (copy, abyssal estimate) over the type price', () => {
    const totals = selectionTotals(
      [3, 4],
      assets,
      prices,
      new Map([
        [3, 1_000_000],
        [4, 42],
      ]),
      volumes
    );
    expect(totals).toEqual({ isk: 1_000_042, volume: 0, unpriced: 0 });
  });

  it('skips ids no longer in the asset map', () => {
    expect(selectionTotals([1, 77], assets, prices, new Map(), volumes)).toEqual({
      isk: 2500,
      volume: 5,
      unpriced: 0,
    });
  });
});
