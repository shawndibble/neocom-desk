import { describe, it, expect } from 'vitest';
import { buildVariationIndex, type VariationTypeMap } from '@/engine/market/variations';
import { getVariationRows, tierLabel, RELATED_ITEMS_LIMIT } from './variations';
import type { MarketTypeEntry } from '@/sde/marketTypes';

const META_GROUP_NAMES = { 1: 'Tech I', 2: 'Tech II', 4: 'Faction' };

function type(typeId: number, name: string, marketGroupId: number): MarketTypeEntry {
  return { typeId, name, marketGroupId };
}

describe('tierLabel', () => {
  it('abbreviates Tech I/II/III to T1/T2/T3', () => {
    expect(tierLabel('Tech I')).toBe('T1');
    expect(tierLabel('Tech II')).toBe('T2');
    expect(tierLabel('Tech III')).toBe('T3');
  });

  it('passes non-Tech meta group names through unchanged', () => {
    expect(tierLabel('Faction')).toBe('Faction');
    expect(tierLabel('Storyline')).toBe('Storyline');
    expect(tierLabel('Officer')).toBe('Officer');
  });
});

describe('getVariationRows', () => {
  it('returns the variation group, excluding the selected item, with tier labels', () => {
    const types: VariationTypeMap = {
      587: { parentTypeId: null, metaGroupId: 1 },
      588: { parentTypeId: 587, metaGroupId: 2 },
      589: { parentTypeId: 587, metaGroupId: 4 },
    };
    const index = buildVariationIndex(types, META_GROUP_NAMES);
    const typesByGroup = new Map<number, MarketTypeEntry[]>();
    const typesById = new Map<number, MarketTypeEntry>([
      [587, type(587, 'Rifter', 2)],
      [588, type(588, 'Republic Fleet Rifter', 2)],
      [589, type(589, "Vherokior's Slasher", 2)],
    ]);
    const result = getVariationRows(index, typesByGroup, typesById, type(587, 'Rifter', 2));
    expect(result.rows).toEqual([
      { typeId: 588, name: 'Republic Fleet Rifter', tier: 'T2' },
      { typeId: 589, name: "Vherokior's Slasher", tier: 'Faction' },
    ]);
    expect(result.totalCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('skips a variation member absent from the published market types', () => {
    const types: VariationTypeMap = {
      587: { parentTypeId: null, metaGroupId: 1 },
      588: { parentTypeId: 587, metaGroupId: 2 },
    };
    const index = buildVariationIndex(types, META_GROUP_NAMES);
    const typesByGroup = new Map<number, MarketTypeEntry[]>();
    // 588 has no entry in typesById — unpublished, so it's skipped rather than fabricated.
    const typesById = new Map<number, MarketTypeEntry>([[587, type(587, 'Rifter', 2)]]);
    const result = getVariationRows(index, typesByGroup, typesById, type(587, 'Rifter', 2));
    expect(result.rows).toEqual([]);
  });

  it('falls back to Market Group siblings when the item has no variation data', () => {
    const index = buildVariationIndex({}, META_GROUP_NAMES);
    const typesByGroup = new Map<number, MarketTypeEntry[]>([
      [3, [type(34, 'Tritanium', 3), type(35, 'Pyerite', 3), type(36, 'Mexallon', 3)]],
    ]);
    const typesById = new Map<number, MarketTypeEntry>();
    const result = getVariationRows(index, typesByGroup, typesById, type(34, 'Tritanium', 3));
    expect(result.rows).toEqual([
      { typeId: 35, name: 'Pyerite', tier: null },
      { typeId: 36, name: 'Mexallon', tier: null },
    ]);
    expect(result.totalCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('falls back to siblings when the variation group has only the selected item itself', () => {
    const types: VariationTypeMap = { 34: { parentTypeId: null, metaGroupId: 1 } };
    const index = buildVariationIndex(types, META_GROUP_NAMES);
    const typesByGroup = new Map<number, MarketTypeEntry[]>([
      [3, [type(34, 'Tritanium', 3), type(35, 'Pyerite', 3)]],
    ]);
    const typesById = new Map<number, MarketTypeEntry>([[34, type(34, 'Tritanium', 3)]]);
    const result = getVariationRows(index, typesByGroup, typesById, type(34, 'Tritanium', 3));
    expect(result.rows).toEqual([{ typeId: 35, name: 'Pyerite', tier: null }]);
  });

  it('returns no rows when neither variation data nor a Market Group entry exists', () => {
    const index = buildVariationIndex({}, META_GROUP_NAMES);
    const result = getVariationRows(index, new Map(), new Map(), type(587, 'Rifter', 2));
    expect(result.rows).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('bounds a large variation group at RELATED_ITEMS_LIMIT and reports the true total', () => {
    const types: Record<number, VariationTypeMap[number]> = {
      1: { parentTypeId: null, metaGroupId: 1 },
    };
    const typesById = new Map<number, MarketTypeEntry>([[1, type(1, 'Selected', 5)]]);
    for (let i = 0; i < RELATED_ITEMS_LIMIT + 10; i++) {
      const childId = 1000 + i;
      types[childId] = { parentTypeId: 1, metaGroupId: 2 };
      typesById.set(childId, type(childId, `Item ${i}`, 5));
    }
    const index = buildVariationIndex(types, META_GROUP_NAMES);
    const result = getVariationRows(index, new Map(), typesById, type(1, 'Selected', 5));
    expect(result.rows).toHaveLength(RELATED_ITEMS_LIMIT);
    expect(result.totalCount).toBe(RELATED_ITEMS_LIMIT + 10);
    expect(result.truncated).toBe(true);
  });

  it('bounds a large sibling fallback at RELATED_ITEMS_LIMIT and reports the true total', () => {
    const index = buildVariationIndex({}, META_GROUP_NAMES);
    const many = Array.from({ length: RELATED_ITEMS_LIMIT + 10 }, (_, i) =>
      type(1000 + i, `Item ${i}`, 5)
    );
    const typesByGroup = new Map<number, MarketTypeEntry[]>([
      [5, [type(1, 'Selected', 5), ...many]],
    ]);
    const result = getVariationRows(index, typesByGroup, new Map(), type(1, 'Selected', 5));
    expect(result.rows).toHaveLength(RELATED_ITEMS_LIMIT);
    expect(result.totalCount).toBe(RELATED_ITEMS_LIMIT + 10);
    expect(result.truncated).toBe(true);
  });
});
