/**
 * What's profitable shows its ranking a page at a time: a full scan ranks
 * several hundred products, and nobody reads past the first couple hundred.
 */
import { sortRowsBy } from '@/components/ui/dataTableSort';

export const MARKET_WIDE_PAGE_SIZE = 200;

/**
 * The first `limit` rows under the active sort. Sorts before it cuts, so
 * re-sorting by another column reaches the whole ranking — not just whichever
 * rows happened to make the previous sort's first page.
 */
export function topRows<T>(
  rows: readonly T[],
  sortValue: ((row: T) => string | number | undefined) | undefined,
  direction: 'asc' | 'desc',
  limit: number
): T[] {
  const sorted = sortValue ? sortRowsBy(rows, sortValue, direction) : [...rows];
  return sorted.slice(0, limit);
}
