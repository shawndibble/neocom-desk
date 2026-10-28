import { describe, expect, it } from 'vitest';
import { firstSortDirection, nextDataTableSort, sortRows } from './dataTableSort';

describe('sortRows', () => {
  it('pins the default-options collator: text orders as a bare localeCompare, ties stable', () => {
    const rows = ['b', 'Á', 'a', 'B', 'á', 'A', 'a', 'item 10', 'item 2', 'Ω'].map(
      (name, index) => ({ name, index })
    );
    const byLocaleCompare = [...rows].sort((x, y) => x.name.localeCompare(y.name));
    expect(sortRows(rows, { sortValue: (row) => row.name }, 'asc')).toEqual(byLocaleCompare);
  });

  it('puts rows with no sort value last, in their original order, either direction', () => {
    const rows = [{ v: 2 }, { v: undefined }, { v: 1 }, { v: undefined }];
    const column = { sortValue: (row: { v: number | undefined }) => row.v };
    expect(sortRows(rows, column, 'desc')).toEqual([rows[0], rows[2], rows[1], rows[3]]);
  });
});

describe('firstSortDirection', () => {
  const rows = [
    { n: undefined, s: undefined },
    { n: 3, s: 'b' },
    { n: 1, s: 'a' },
  ] as {
    n: number | undefined;
    s: string | undefined;
  }[];

  it('starts a numeric column high to low, typed by its first non-missing value', () => {
    expect(firstSortDirection({ sortValue: (row) => row.n }, rows)).toBe('desc');
  });

  it('starts a text column A-Z', () => {
    expect(firstSortDirection({ sortValue: (row) => row.s }, rows)).toBe('asc');
  });

  it('lets a column opt out with sortFirst', () => {
    expect(firstSortDirection({ sortValue: (row) => row.n, sortFirst: 'asc' }, rows)).toBe('asc');
  });

  it('falls back to ascending when no row has a value', () => {
    expect(firstSortDirection({ sortValue: (row) => row.n }, [] as typeof rows)).toBe('asc');
  });
});

describe('nextDataTableSort', () => {
  it('starts an inactive column at the given first direction, ascending by default', () => {
    expect(nextDataTableSort(null, 'a')).toEqual({ columnId: 'a', direction: 'asc' });
    expect(nextDataTableSort(null, 'a', 'desc')).toEqual({ columnId: 'a', direction: 'desc' });
  });

  it('flips the active column either way', () => {
    expect(nextDataTableSort({ columnId: 'a', direction: 'desc' }, 'a', 'desc')).toEqual({
      columnId: 'a',
      direction: 'asc',
    });
    expect(nextDataTableSort({ columnId: 'a', direction: 'asc' }, 'a', 'desc')).toEqual({
      columnId: 'a',
      direction: 'desc',
    });
  });
});
