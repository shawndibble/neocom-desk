import { describe, it, expect } from 'vitest';
import type { TypeMap } from '@/sde/types';
import { searchTypes, SEARCH_RESULT_LIMIT } from './search';

const TYPES: TypeMap = {
  '1': { name: 'Tritanium', groupID: 1, volume: 0.01 },
  '2': { name: 'Tritanium Ore', groupID: 1, volume: 1 },
  '3': { name: 'Some Tritanium Widget', groupID: 1, volume: 1 },
  '4': { name: 'Zzz Tritanium', groupID: 1, volume: 1 },
};

describe('searchTypes', () => {
  it('returns [] for an empty query', () => {
    expect(searchTypes(TYPES, '')).toEqual([]);
  });

  it('returns [] for a whitespace-only query', () => {
    expect(searchTypes(TYPES, '   ')).toEqual([]);
  });

  it('ranks exact > prefix > substring, alphabetical within a rank', () => {
    const result = searchTypes(TYPES, 'tritanium');
    expect(result.map((r) => r.name)).toEqual([
      'Tritanium',
      'Tritanium Ore',
      'Some Tritanium Widget',
      'Zzz Tritanium',
    ]);
  });

  it('is case-insensitive and returns typeId/name/volume', () => {
    const result = searchTypes(TYPES, 'TRITANIUM');
    expect(result[0]).toEqual({ typeId: 1, name: 'Tritanium', volume: 0.01 });
  });

  it('caps at SEARCH_RESULT_LIMIT, keeping the highest-ranked matches', () => {
    const many: TypeMap = {};
    for (let i = 0; i < 60; i += 1) {
      many[String(i)] = { name: `Aa Widget ${String(i).padStart(2, '0')}`, groupID: 1, volume: 1 };
    }
    many['999'] = { name: 'Zzz', groupID: 1, volume: 1 };

    const result = searchTypes(many, 'zzz');
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Zzz');

    const substringResult = searchTypes(many, 'widget');
    expect(substringResult).toHaveLength(SEARCH_RESULT_LIMIT);
  });
});
