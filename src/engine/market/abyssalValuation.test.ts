import { describe, expect, it } from 'vitest';
import {
  abyssalItemRefs,
  abyssalItemValues,
  splitAbyssalUnmatched,
  summarizeAbyssal,
  withoutAbyssalTypePrices,
} from './abyssalValuation';

const NEUT = 47832; // Heavy Abyssal Energy Neutralizer
const BCS = 49738;
const TRIT = 34;
const isAbyssalType = (typeId: number) => typeId === NEUT || typeId === BCS;

describe('abyssalItemValues', () => {
  it('values each item at its own priced estimate, skipping the rest', () => {
    const values = abyssalItemValues(
      [1, 2, 3],
      new Map([
        [1, { value: 120_000_000 }],
        [2, { value: null }],
        [4, { value: 5 }],
      ])
    );
    expect([...values]).toEqual([[1, 120_000_000]]);
  });

  it('never takes a zero, negative or non-finite estimate', () => {
    const values = abyssalItemValues(
      [1, 2, 3],
      new Map([
        [1, { value: 0 }],
        [2, { value: -5 }],
        [3, { value: Number.NaN }],
      ])
    );
    expect(values.size).toBe(0);
  });
});

describe('abyssalItemRefs', () => {
  it('keeps only the abyssal assets, as item/type refs', () => {
    expect(
      abyssalItemRefs(
        [
          { item_id: 1, type_id: NEUT },
          { item_id: 4, type_id: TRIT },
        ],
        isAbyssalType
      )
    ).toEqual([{ itemId: 1, typeId: NEUT }]);
  });
});

describe('summarizeAbyssal', () => {
  it('splits items into priced, answered without a price, and not yet answered', () => {
    expect(
      summarizeAbyssal(
        [1, 2, 3, 5],
        new Map([
          [1, 100],
          [3, 50],
        ]),
        new Set([1, 2, 3])
      )
    ).toEqual({ priced: 2, unpriced: 1, pending: 1 });
  });

  it('is all zeros with no item', () => {
    expect(summarizeAbyssal([], new Map(), new Set())).toEqual({
      priced: 0,
      unpriced: 0,
      pending: 0,
    });
  });
});

describe('withoutAbyssalTypePrices', () => {
  it('drops every abyssal type, so none is valued at a type-wide price', () => {
    const prices = new Map([
      [NEUT, 1_000],
      [TRIT, 4],
    ]);
    expect([...withoutAbyssalTypePrices(prices, isAbyssalType)]).toEqual([[TRIT, 4]]);
  });

  it('hands back the same map when there is nothing to drop', () => {
    const prices = new Map([[TRIT, 4]]);
    expect(withoutAbyssalTypePrices(prices, isAbyssalType)).toBe(prices);
  });
});

describe('splitAbyssalUnmatched', () => {
  it('moves pasted abyssal type names out of the unmatched lines, ignoring case', () => {
    const { abyssal, unmatched } = splitAbyssalUnmatched(
      [
        { name: 'Heavy Abyssal Energy Neutralizer', lines: [2, 5] },
        { name: 'Tritanum', lines: [1] },
      ],
      new Set(['heavy abyssal energy neutralizer'])
    );
    expect(abyssal).toEqual([{ name: 'Heavy Abyssal Energy Neutralizer', lines: [2, 5] }]);
    expect(unmatched).toEqual([{ name: 'Tritanum', lines: [1] }]);
  });
});
