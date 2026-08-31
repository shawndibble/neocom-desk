import { describe, expect, it } from 'vitest';
import { searchTypes, SEARCH_RESULT_LIMIT } from './search';
import type { TypeMap } from '@/sde/types';

const TYPES: TypeMap = {
  '1': { name: 'Tritanium', groupID: 1, volume: 0.01 },
  '2': { name: 'Tritanium Ore', groupID: 2, volume: 0.1 },
  '3': { name: 'Pyerite', groupID: 1, volume: 0.01 },
};

describe('searchTypes', () => {
  it('returns [] for an empty query', () => {
    expect(searchTypes(TYPES, '')).toEqual([]);
  });

  it('ranks exact match above prefix match', () => {
    const result = searchTypes(TYPES, 'tritanium');
    expect(result.map((r) => r.name)).toEqual(['Tritanium', 'Tritanium Ore']);
  });

  it('carries typeId and volume through', () => {
    const result = searchTypes(TYPES, 'pyerite');
    expect(result).toEqual([{ typeId: 3, name: 'Pyerite', volume: 0.01 }]);
  });

  it('caps results at SEARCH_RESULT_LIMIT', () => {
    const types: TypeMap = {};
    for (let i = 0; i < SEARCH_RESULT_LIMIT + 10; i++) {
      types[String(i)] = { name: `Widget ${i}`, groupID: 1, volume: 1 };
    }
    expect(searchTypes(types, 'widget')).toHaveLength(SEARCH_RESULT_LIMIT);
  });
});
