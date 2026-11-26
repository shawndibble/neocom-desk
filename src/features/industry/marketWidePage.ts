import { sortRowsBy } from '@/components/ui/dataTableSort';

export const MARKET_WIDE_PAGE_SIZE = 200;

export function topRows<T>(
  rows: readonly T[],
  sortValue: ((row: T) => string | number | undefined) | undefined,
  direction: 'asc' | 'desc',
  limit: number
): T[] {
  const sorted = sortValue ? sortRowsBy(rows, sortValue, direction) : [...rows];
  return sorted.slice(0, limit);
}
