import { describe, expect, it } from 'vitest';
import type { LoadedCorpBook } from './corpBookStore';
import { hiddenLeftBooksOf, isLeftBook, leftCorpBooksOf, withoutHiddenLeft } from './leftCorpBooks';

const book = (corporationId: number, over: Partial<LoadedCorpBook> = {}) =>
  ({
    corporationId,
    characterIds: [1],
    memberCharacterIds: [1],
    ...over,
  }) as LoadedCorpBook;

const IN = book(10);
const LEFT = book(20, { characterIds: [1, 2], memberCharacterIds: [] });
const BILLED = book(30, { characterIds: [1], memberCharacterIds: [1] });
const names = new Map([
  [10, 'In Corp'],
  [20, 'Ashfall Mining Co.'],
]);
const nameOf = (id: number) => names.get(id) ?? `#${id}`;

describe('isLeftBook', () => {
  it('is a book read for Characters of whom none is in or billed by the corporation now', () => {
    expect(isLeftBook(LEFT)).toBe(true);
    expect(isLeftBook(IN)).toBe(false);
    expect(isLeftBook(BILLED)).toBe(false);
    expect(isLeftBook(book(40, { characterIds: [], memberCharacterIds: [] }))).toBe(false);
  });
});

describe('leftCorpBooksOf', () => {
  it('lists each left book with its name, the open amount and who left', () => {
    const out = leftCorpBooksOf([IN, LEFT], nameOf, (id) => (id === 20 ? 1_250_000 : 0));
    expect(out).toEqual([
      { corporationId: 20, corpName: 'Ashfall Mining Co.', owed: 1_250_000, characterIds: [1, 2] },
    ]);
  });

  it('is empty when every book is still the member’s', () => {
    expect(leftCorpBooksOf([IN, BILLED], nameOf, () => 5)).toEqual([]);
  });
});

describe('withoutHiddenLeft', () => {
  it('drops only the left books the member chose to stop showing', () => {
    expect(withoutHiddenLeft([IN, LEFT], new Set([20]))).toEqual([IN]);
    expect(withoutHiddenLeft([IN, LEFT], new Set())).toEqual([IN, LEFT]);
  });

  it('never drops a book the member is in, even if its id was once hidden', () => {
    expect(withoutHiddenLeft([IN, LEFT], new Set([10]))).toEqual([IN, LEFT]);
  });
});

describe('hiddenLeftBooksOf', () => {
  it('names the hidden left books so they can be shown again', () => {
    expect(hiddenLeftBooksOf([IN, LEFT], new Set([20, 10]), nameOf)).toEqual([
      { corporationId: 20, corpName: 'Ashfall Mining Co.' },
    ]);
  });
});
