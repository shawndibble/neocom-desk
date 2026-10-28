import { describe, expect, it } from 'vitest';
import { BOOK_LEVELS, HaulingBookFold } from './haulingBooks.js';

const JITA = 60003760;
const AMARR = 60008494;

describe('HaulingBookFold', () => {
  it("folds a station's orders into price levels, sell cheapest first and buy dearest first", () => {
    const fold = new HaulingBookFold([JITA]);
    fold.add(JITA, 34, false, 6.1, 10);
    fold.add(JITA, 34, false, 6.0, 5);
    fold.add(JITA, 34, false, 6.0, 7);
    fold.add(JITA, 34, true, 5.5, 3);
    fold.add(JITA, 34, true, 5.6, 4);
    const books = fold.toObject(JITA, { lastSyncedAt: 1, asOf: 2 });
    expect(books.types[34]).toEqual([
      [
        [6.0, 12, 2],
        [6.1, 10, 1],
      ],
      [
        [5.6, 4, 1],
        [5.5, 3, 1],
      ],
    ]);
    expect(books).toMatchObject({ stationId: JITA, lastSyncedAt: 1, asOf: 2 });
  });

  it('ignores orders at other stations and empty orders', () => {
    const fold = new HaulingBookFold([JITA]);
    fold.add(AMARR, 34, false, 1, 10);
    fold.add(JITA, 35, false, 1, 0);
    expect(fold.typeCount(JITA)).toBe(0);
    expect(fold.toObject(JITA, { lastSyncedAt: 1, asOf: 2 }).types).toEqual({});
  });

  it('keeps only the best levels of each side', () => {
    const fold = new HaulingBookFold([JITA]);
    for (let i = 1; i <= BOOK_LEVELS + 5; i += 1) {
      fold.add(JITA, 34, false, i, 1);
      fold.add(JITA, 34, true, 1000 - i, 1);
    }
    const [sell, buy] = fold.toObject(JITA, { lastSyncedAt: 1, asOf: 2 }).types[34];
    expect(sell).toHaveLength(BOOK_LEVELS);
    expect(sell[0][0]).toBe(1);
    expect(buy).toHaveLength(BOOK_LEVELS);
    expect(buy[0][0]).toBe(999);
  });

  it('leaves out a type with orders on neither side', () => {
    const fold = new HaulingBookFold([JITA]);
    fold.add(JITA, 34, true, 5, 0);
    expect(fold.typeCount(JITA)).toBe(0);
  });
});
