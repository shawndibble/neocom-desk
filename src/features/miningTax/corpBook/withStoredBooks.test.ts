import { describe, expect, it } from 'vitest';
import { withStoredBooks } from './corpBookSources';
import type { LoadedCorpBook } from './corpBookStore';

const book = (corporationId: number, startDate = '2026-01-01') =>
  ({ corporationId, startDate }) as LoadedCorpBook;
const read = (books: LoadedCorpBook[], failed: number[] = [], unreadable = false) => ({
  books,
  failed,
  unreadable,
});

describe('withStoredBooks', () => {
  it('uses what was read when nothing failed', () => {
    const fresh = [book(1, '2026-02-01')];
    expect(withStoredBooks(read(fresh), [book(1), book(2)])).toEqual(fresh);
  });

  it('keeps the stored copy of a book whose read failed', () => {
    const result = withStoredBooks(read([book(1, '2026-02-01')], [2]), [book(1), book(2)]);
    expect(result).toEqual([book(1, '2026-02-01'), book(2)]);
  });

  it('keeps every stored book when the corporations could not even be listed', () => {
    expect(withStoredBooks(read([], [], true), [book(1), book(2)])).toEqual([book(1), book(2)]);
  });

  it('drops a stored book that is gone or hidden, which is not a failure', () => {
    expect(withStoredBooks(read([book(1)]), [book(1), book(2)])).toEqual([book(1)]);
  });
});
