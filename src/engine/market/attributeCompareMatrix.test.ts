import { describe, expect, it } from 'vitest';
import {
  buildCompareMatrix,
  isUniformRow,
  type CompareAttributeRow,
  type CompareCell,
  type CompareMatrixItem,
} from './attributeCompareMatrix';
import type { AttributeDictionary } from './itemAttributes';

/** The engine takes these already translated; the values match `market.compare.*`. */
const LABELS = { worth: 'Worth', estimatedPrice: 'Estimated Price' };
const DICTIONARY: AttributeDictionary = {
  9: { name: 'Structure Hitpoints', unit: 'HP', category: 'Structure' },
  37: { name: 'Maximum Velocity', unit: 'm/sec', category: 'Speed and Travel' },
  38: { name: 'Capacity', unit: 'm3', category: 'Fitting' },
  182: { name: 'Primary Skill required', unit: 'typeID', category: 'Required Skills' },
  786: { name: 'Crystals Take Damage', unit: '1=True 0=False', category: 'Miscellaneous' },
  137: { name: 'Used with (Launcher Group)', unit: 'groupID', category: 'Miscellaneous' },
};

const NAMES = { types: { 24241: 'Caldari Frigate' }, groups: { 483: 'Mining Laser' } };

describe('buildCompareMatrix', () => {
  it('always leads with a Worth group carrying the Estimated Price row', () => {
    const items: CompareMatrixItem[] = [
      { typeId: 1, dogmaAttributes: undefined, bestSell: 100 },
      { typeId: 2, dogmaAttributes: undefined, bestSell: 250 },
    ];
    const groups = buildCompareMatrix(items, DICTIONARY, LABELS);
    expect(groups[0]).toEqual({
      category: 'Worth',
      rows: [
        {
          key: 'price',
          name: 'Estimated Price',
          kind: 'price',
          cells: new Map([
            [1, { value: 100, unit: null }],
            [2, { value: 250, unit: null }],
          ]),
        },
      ],
    });
  });

  it('leaves the price cell blank for an item with no known best sell', () => {
    const items: CompareMatrixItem[] = [
      { typeId: 1, dogmaAttributes: undefined, bestSell: 100 },
      { typeId: 2, dogmaAttributes: undefined, bestSell: null },
    ];
    const groups = buildCompareMatrix(items, DICTIONARY, LABELS);
    const priceRow = groups[0].rows[0];
    expect(priceRow.cells.has(1)).toBe(true);
    expect(priceRow.cells.has(2)).toBe(false);
  });

  it('unions attributes across items, grouped by category, sorted alphabetically', () => {
    const items: CompareMatrixItem[] = [
      {
        typeId: 1,
        dogmaAttributes: [
          { attribute_id: 9, value: 1200 },
          { attribute_id: 37, value: 250 },
        ],
        bestSell: null,
      },
      {
        typeId: 2,
        dogmaAttributes: [{ attribute_id: 38, value: 100 }],
        bestSell: null,
      },
    ];
    const groups = buildCompareMatrix(items, DICTIONARY, LABELS);
    expect(groups.map((g) => g.category)).toEqual([
      'Worth',
      'Fitting',
      'Speed and Travel',
      'Structure',
    ]);
  });

  it('leaves a blank cell (no map entry) for an item missing a given attribute', () => {
    const items: CompareMatrixItem[] = [
      { typeId: 1, dogmaAttributes: [{ attribute_id: 9, value: 1200 }], bestSell: null },
      { typeId: 2, dogmaAttributes: [{ attribute_id: 37, value: 250 }], bestSell: null },
    ];
    const groups = buildCompareMatrix(items, DICTIONARY, LABELS);
    const structureRow = groups.find((g) => g.category === 'Structure')!.rows[0];
    expect(structureRow.cells.get(1)).toEqual({ value: 1200, unit: 'HP' });
    expect(structureRow.cells.has(2)).toBe(false);
  });

  it('excludes the flavor-text description — only dogma attributes and price are represented', () => {
    const items: CompareMatrixItem[] = [
      { typeId: 1, dogmaAttributes: [{ attribute_id: 9, value: 1200 }], bestSell: 50 },
    ];
    const groups = buildCompareMatrix(items, DICTIONARY, LABELS);
    const categories = groups.map((g) => g.category);
    expect(categories).toEqual(['Worth', 'Structure']);
  });

  it('carries a required-skill row displayValue through per item', () => {
    const items: CompareMatrixItem[] = [
      { typeId: 1, dogmaAttributes: [{ attribute_id: 182, value: 24241 }], bestSell: null },
    ];
    const groups = buildCompareMatrix(items, DICTIONARY, LABELS, NAMES);
    const skillRow = groups.find((g) => g.category === 'Required Skills')!.rows[0];
    expect(skillRow.cells.get(1)).toEqual({
      value: 24241,
      unit: null,
      displayValue: 'Caldari Frigate I',
    });
  });

  it('carries an enum-legend row through as its member, so cells differ readably', () => {
    const items: CompareMatrixItem[] = [
      { typeId: 1, dogmaAttributes: [{ attribute_id: 786, value: 1 }], bestSell: null },
      { typeId: 2, dogmaAttributes: [{ attribute_id: 786, value: 0 }], bestSell: null },
    ];
    const row = buildCompareMatrix(items, DICTIONARY, LABELS).flatMap((g) => g.rows)[1];
    expect(row.name).toBe('Crystals Take Damage');
    expect(row.cells.get(1)).toEqual({ value: 1, unit: null, displayValue: 'True' });
    expect(row.cells.get(2)).toEqual({ value: 0, unit: null, displayValue: 'False' });
  });

  it('carries a resolved id reference through as the name it points at', () => {
    const items: CompareMatrixItem[] = [
      { typeId: 1, dogmaAttributes: [{ attribute_id: 137, value: 483 }], bestSell: null },
      { typeId: 2, dogmaAttributes: [{ attribute_id: 137, value: 99999 }], bestSell: null },
    ];
    const row = buildCompareMatrix(items, DICTIONARY, LABELS, NAMES).flatMap((g) => g.rows)[1];
    expect(row.name).toBe('Used with (Launcher Group)');
    expect(row.cells.get(1)).toEqual({ value: 483, unit: null, displayValue: 'Mining Laser' });
    // Unresolvable: unchanged from today rather than blanked.
    expect(row.cells.get(2)).toEqual({ value: 99999, unit: 'groupID' });
  });

  it('marks non-price rows as kind "attribute"', () => {
    const items: CompareMatrixItem[] = [
      { typeId: 1, dogmaAttributes: [{ attribute_id: 9, value: 1200 }], bestSell: null },
    ];
    const groups = buildCompareMatrix(items, DICTIONARY, LABELS);
    const structureRow = groups.find((g) => g.category === 'Structure')!.rows[0];
    expect(structureRow.kind).toBe('attribute');
  });
});

describe('isUniformRow', () => {
  const row = (cells: [number, CompareCell][]): CompareAttributeRow => ({
    key: 'attr:1',
    name: 'X',
    kind: 'attribute',
    cells: new Map(cells),
  });
  const typeIds = [1, 2, 3];

  it('is true when every item has the same value', () => {
    expect(
      isUniformRow(
        row([
          [1, { value: 5, unit: 'm' }],
          [2, { value: 5, unit: 'm' }],
          [3, { value: 5, unit: 'm' }],
        ]),
        typeIds
      )
    ).toBe(true);
  });

  it('is false when any value differs', () => {
    expect(
      isUniformRow(
        row([
          [1, { value: 5, unit: 'm' }],
          [2, { value: 6, unit: 'm' }],
          [3, { value: 5, unit: 'm' }],
        ]),
        typeIds
      )
    ).toBe(false);
  });

  it('is false when an item lacks the attribute — absent is a difference', () => {
    expect(
      isUniformRow(
        row([
          [1, { value: 5, unit: 'm' }],
          [2, { value: 5, unit: 'm' }],
        ]),
        typeIds
      )
    ).toBe(false);
  });

  it('compares display values, so two different required skills differ', () => {
    expect(
      isUniformRow(
        row([
          [1, { value: 1, unit: null, displayValue: 'Gunnery I' }],
          [2, { value: 1, unit: null, displayValue: 'Shields I' }],
          [3, { value: 1, unit: null, displayValue: 'Gunnery I' }],
        ]),
        typeIds
      )
    ).toBe(false);
  });

  it('never treats the price row as uniform, so Differences only always keeps it', () => {
    const price: CompareAttributeRow = {
      key: 'price',
      name: 'Estimated Price',
      kind: 'price',
      cells: new Map([
        [1, { value: 5, unit: null }],
        [2, { value: 5, unit: null }],
        [3, { value: 5, unit: null }],
      ]),
    };
    expect(isUniformRow(price, typeIds)).toBe(false);
  });

  it('is false with fewer than two items — nothing to compare', () => {
    expect(isUniformRow(row([[1, { value: 5, unit: 'm' }]]), [1])).toBe(false);
  });
});
