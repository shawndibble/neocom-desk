import { describe, expect, it } from 'vitest';
import { minusLines, priceMap } from './oreLines';

describe('minusLines', () => {
  it('takes every line of a type off, dropping what reaches zero', () => {
    expect(
      minusLines(
        [
          { typeId: 1, quantity: 100 },
          { typeId: 2, quantity: 10 },
        ],
        [
          { typeId: 1, quantity: 30 },
          { typeId: 1, quantity: 20 },
          { typeId: 2, quantity: 10 },
        ]
      )
    ).toEqual([{ typeId: 1, quantity: 50 }]);
  });

  it('copies the lines when nothing is taken', () => {
    expect(minusLines([{ typeId: 1, quantity: 5 }], undefined)).toEqual([
      { typeId: 1, quantity: 5 },
    ]);
  });
});

describe('priceMap', () => {
  it('keys a stored price record by numeric type id', () => {
    expect(priceMap({ 45490: 10 }).get(45490)).toBe(10);
  });
});
