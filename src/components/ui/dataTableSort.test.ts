import { describe, expect, it } from 'vitest';
import { sortRows } from './dataTableSort';

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
