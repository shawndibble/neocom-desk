import { describe, it, expect } from 'vitest';
import {
  topTypesWithOther,
  topValuesWithOther,
  type RankedType,
  type ValueRanked,
} from './topTypes';

function ore(typeId: number, rawValue: number, refineValue = rawValue): RankedType {
  return { typeId, typeName: `Ore ${typeId}`, rawValue, refineValue };
}

function valueOre(typeId: number, value: number): ValueRanked {
  return { typeId, typeName: `Ore ${typeId}`, value };
}

describe('topTypesWithOther', () => {
  it('returns every type, largest first, when there are no more than the limit', () => {
    const result = topTypesWithOther([ore(1, 10), ore(2, 30), ore(3, 20)], { limit: 8, by: 'raw' });
    expect(result.top.map((point) => point.typeId)).toEqual([2, 3, 1]);
    expect(result.other).toBeNull();
  });

  it('keeps one extra type instead of folding a single type into "Other"', () => {
    const types = Array.from({ length: 9 }, (_, index) => ore(index + 1, 100 - index));
    const result = topTypesWithOther(types, { limit: 8, by: 'raw' });
    expect(result.top).toHaveLength(9);
    expect(result.other).toBeNull();
  });

  it('folds everything past the limit into one summed "Other" entry', () => {
    const types = Array.from({ length: 12 }, (_, index) => ore(index + 1, 120 - index * 10, 5));
    const result = topTypesWithOther(types, { limit: 8, by: 'raw' });
    expect(result.top.map((point) => point.typeId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.other).toEqual({
      rawValue: 40 + 30 + 20 + 10,
      refineValue: 20,
      types: [ore(9, 40, 5), ore(10, 30, 5), ore(11, 20, 5), ore(12, 10, 5)],
    });
  });

  it('ranks by raw plus refined value when ranking by both', () => {
    const result = topTypesWithOther([ore(1, 50, 0), ore(2, 30, 40)], { limit: 8, by: 'both' });
    expect(result.top.map((point) => point.typeId)).toEqual([2, 1]);
  });
});

describe('topValuesWithOther', () => {
  it('returns every type, largest first, when there are no more than the limit', () => {
    const result = topValuesWithOther([valueOre(1, 10), valueOre(2, 30), valueOre(3, 20)], {
      limit: 8,
    });
    expect(result.top.map((point) => point.typeId)).toEqual([2, 3, 1]);
    expect(result.other).toBeNull();
  });

  it('folds everything past the limit into one summed "Other" entry', () => {
    const types = Array.from({ length: 12 }, (_, index) => valueOre(index + 1, 120 - index * 10));
    const result = topValuesWithOther(types, { limit: 8 });
    expect(result.top.map((point) => point.typeId)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result.other).toEqual({
      value: 40 + 30 + 20 + 10,
      types: [valueOre(9, 40), valueOre(10, 30), valueOre(11, 20), valueOre(12, 10)],
    });
  });
});
