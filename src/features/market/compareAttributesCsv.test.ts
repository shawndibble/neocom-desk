import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type {
  CompareAttributeGroup,
  CompareAttributeRow,
  CompareCell,
} from '@/engine/market/attributeCompareMatrix';
import { compareAttributesCsvColumns, flattenCompareGroups } from './compareAttributesCsv';

const t = (k: string) => k;

const ITEMS = [
  { typeId: 1, itemName: 'Rifter' },
  { typeId: 2, itemName: 'Slasher' },
];

function attrRow(
  key: string,
  name: string,
  cells: [number, CompareCell][],
  kind: CompareAttributeRow['kind'] = 'attribute'
): CompareAttributeRow {
  return { key, name, kind, cells: new Map(cells) };
}

const GROUPS: CompareAttributeGroup[] = [
  {
    category: 'Worth',
    rows: [attrRow('price', 'Estimated Price', [[1, { value: 450000.5, unit: null }]], 'price')],
  },
  {
    category: 'Structure',
    rows: [
      attrRow('9', 'Structure Hitpoints', [
        [1, { value: 350, unit: 'HP' }],
        [2, { value: 300.25, unit: 'HP' }],
      ]),
      attrRow('182', 'Primary Skill required', [
        [1, { value: 3329, unit: 'typeID', displayValue: 'Minmatar Frigate I' }],
        [2, { value: 3329, unit: 'typeID', displayValue: 'Minmatar Frigate I' }],
      ]),
    ],
  },
];

function csvLines(): string[][] {
  const { rows, categoryOf } = flattenCompareGroups(GROUPS);
  const csv = toCsv(rows, compareAttributesCsvColumns(t, ITEMS, categoryOf));
  return csv
    .trim()
    .split('\r\n')
    .map((line) => line.split(','));
}

describe('compareAttributesCsvColumns', () => {
  it('leads with category, attribute and unit, then one column per item', () => {
    const { categoryOf } = flattenCompareGroups(GROUPS);
    expect(compareAttributesCsvColumns(t, ITEMS, categoryOf).map((c) => c.header)).toEqual([
      'market.compare.categoryColumn',
      'market.compare.attributeColumn',
      'market.compare.unitColumn',
      'Rifter',
      'Slasher',
    ]);
  });

  it('flattens every category in matrix order, each row naming its category', () => {
    expect(csvLines().slice(1)).toEqual([
      ['"Worth"', '"Estimated Price"', '', '450000.5', ''],
      ['"Structure"', '"Structure Hitpoints"', '"HP"', '350', '300.25'],
      [
        '"Structure"',
        '"Primary Skill required"',
        '',
        '"Minmatar Frigate I"',
        '"Minmatar Frigate I"',
      ],
    ]);
  });

  it('exports an item missing the attribute as an empty cell, not a zero', () => {
    const [, worth] = csvLines();
    expect(worth[4]).toBe('');
  });
});
