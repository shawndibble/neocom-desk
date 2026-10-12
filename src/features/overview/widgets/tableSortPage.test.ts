import { describe, expect, it } from 'vitest';
import type { TableRowModel } from './data/types';
import {
  clampPage,
  isRowsPerPage,
  pageCount,
  pageRange,
  pageRows,
  ROWS_PER_PAGE_OPTIONS,
  sortTableRows,
} from './tableSortPage';

const row = (key: string, ...sort: (number | string | undefined)[]): TableRowModel => ({
  key,
  cells: sort.map(String),
  sort,
});
const keys = (rows: readonly TableRowModel[]) => rows.map((r) => r.key);

describe('sortTableRows', () => {
  const rows = [row('a', 30), row('b', 10), row('c', undefined), row('d', 20)];

  it('sorts ascending and descending by the column sort key', () => {
    expect(keys(sortTableRows(rows, 0, 'asc'))).toEqual(['b', 'd', 'a', 'c']);
    expect(keys(sortTableRows(rows, 0, 'desc'))).toEqual(['a', 'd', 'b', 'c']);
  });

  it('sinks rows with no key to the end in both directions', () => {
    expect(sortTableRows(rows, 0, 'asc').at(-1)?.key).toBe('c');
    expect(sortTableRows(rows, 0, 'desc').at(-1)?.key).toBe('c');
  });

  it('keeps ties in source order and does not mutate the input', () => {
    const tied = [row('x', 1), row('y', 1), row('z', 1)];
    expect(keys(sortTableRows(tied, 0, 'desc'))).toEqual(['x', 'y', 'z']);
    sortTableRows(rows, 0, 'asc');
    expect(keys(rows)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('sorts strings with the locale collator and treats a row with no sort array as missing', () => {
    const named = [row('1', 'Warp'), row('2', 'Copper'), { key: '3', cells: ['?'] }];
    expect(keys(sortTableRows(named, 0, 'asc'))).toEqual(['2', '1', '3']);
  });
});

describe('paging', () => {
  it('offers 5, 10 and 25 rows per page and validates them', () => {
    expect(ROWS_PER_PAGE_OPTIONS).toEqual([5, 10, 25]);
    expect(isRowsPerPage(10)).toBe(true);
    expect(isRowsPerPage(7)).toBe(false);
    expect(isRowsPerPage('10')).toBe(false);
  });

  it('counts pages, never fewer than one', () => {
    expect(pageCount(0, 5)).toBe(1);
    expect(pageCount(5, 5)).toBe(1);
    expect(pageCount(6, 5)).toBe(2);
    expect(pageCount(23, 10)).toBe(3);
  });

  it('clamps a page into range after the rows shrink', () => {
    expect(clampPage(5, 8, 5)).toBe(2);
    expect(clampPage(0, 8, 5)).toBe(1);
    expect(clampPage(3, 0, 5)).toBe(1);
    expect(clampPage(2, 8, 5)).toBe(2);
  });

  it('slices one page, a short last page, and a page larger than the data', () => {
    const rows = Array.from({ length: 12 }, (_, i) => i);
    expect(pageRows(rows, 1, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(pageRows(rows, 3, 5)).toEqual([10, 11]);
    expect(pageRows(rows, 1, 25)).toHaveLength(12);
    expect(pageRows([], 1, 5)).toEqual([]);
  });

  it('reports the 1-based range on screen', () => {
    expect(pageRange(1, 23, 10)).toEqual({ from: 1, to: 10 });
    expect(pageRange(3, 23, 10)).toEqual({ from: 21, to: 23 });
    expect(pageRange(1, 0, 10)).toEqual({ from: 0, to: 0 });
  });
});
