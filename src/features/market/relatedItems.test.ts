import { describe, it, expect } from 'vitest';
import { getRelatedItems, RELATED_ITEMS_LIMIT } from './relatedItems';
import type { MarketTypeEntry } from '@/sde/marketTypes';

function type(typeId: number, name: string, marketGroupId: number): MarketTypeEntry {
  return { typeId, name, marketGroupId };
}

describe('getRelatedItems', () => {
  it('returns the selected item’s Market Group siblings, excluding itself', () => {
    const typesByGroup = new Map<number, MarketTypeEntry[]>([
      [2, [type(587, 'Rifter', 2), type(588, 'Slasher', 2), type(589, 'Breacher', 2)]],
    ]);
    const result = getRelatedItems(typesByGroup, type(587, 'Rifter', 2));
    expect(result.siblings.map((s) => s.typeId)).toEqual([588, 589]);
    expect(result.totalCount).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('returns no siblings when the group has no other members', () => {
    const typesByGroup = new Map<number, MarketTypeEntry[]>([[3, [type(34, 'Tritanium', 3)]]]);
    const result = getRelatedItems(typesByGroup, type(34, 'Tritanium', 3));
    expect(result.siblings).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });

  it('bounds a large group at RELATED_ITEMS_LIMIT and reports the true total', () => {
    const many = Array.from({ length: RELATED_ITEMS_LIMIT + 10 }, (_, i) =>
      type(1000 + i, `Item ${i}`, 5)
    );
    const typesByGroup = new Map<number, MarketTypeEntry[]>([
      [5, [type(1, 'Selected', 5), ...many]],
    ]);
    const result = getRelatedItems(typesByGroup, type(1, 'Selected', 5));
    expect(result.siblings).toHaveLength(RELATED_ITEMS_LIMIT);
    expect(result.totalCount).toBe(RELATED_ITEMS_LIMIT + 10);
    expect(result.truncated).toBe(true);
  });

  it('returns no siblings for a group missing from the map', () => {
    const result = getRelatedItems(new Map(), type(587, 'Rifter', 2));
    expect(result.siblings).toEqual([]);
    expect(result.totalCount).toBe(0);
    expect(result.truncated).toBe(false);
  });
});
