import { describe, expect, it } from 'vitest';
import { groupSortedRows, orderGroups } from './dataTableGroup';

interface Row {
  id: number;
  route: string | null;
}

const byRoute = (row: Row) => row.route;

describe('groupSortedRows', () => {
  it('returns nothing for no rows', () => {
    expect(groupSortedRows<Row>([], byRoute)).toEqual([]);
  });

  it('gathers equal keys at the position of the group’s first member', () => {
    const rows: Row[] = [
      { id: 1, route: 'A' },
      { id: 2, route: 'B' },
      { id: 3, route: 'A' },
      { id: 4, route: 'C' },
      { id: 5, route: 'B' },
    ];
    expect(groupSortedRows(rows, byRoute)).toEqual([
      { key: 'A', rows: [rows[0], rows[2]] },
      { key: 'B', rows: [rows[1], rows[4]] },
      { key: 'C', rows: [rows[3]] },
    ]);
  });

  it('keeps members in their incoming (sorted) order', () => {
    const rows: Row[] = [
      { id: 9, route: 'A' },
      { id: 1, route: 'A' },
      { id: 5, route: 'A' },
    ];
    expect(groupSortedRows(rows, byRoute)[0]?.rows.map((row) => row.id)).toEqual([9, 1, 5]);
  });

  it('never groups null keys — each is its own singleton, in place', () => {
    const rows: Row[] = [
      { id: 1, route: null },
      { id: 2, route: 'A' },
      { id: 3, route: null },
      { id: 4, route: 'A' },
    ];
    expect(groupSortedRows(rows, byRoute)).toEqual([
      { key: null, rows: [rows[0]] },
      { key: 'A', rows: [rows[1], rows[3]] },
      { key: null, rows: [rows[2]] },
    ]);
  });

  it('does not mutate its input', () => {
    const rows: Row[] = [
      { id: 1, route: 'A' },
      { id: 2, route: 'B' },
      { id: 3, route: 'A' },
    ];
    const copy = [...rows];
    groupSortedRows(rows, byRoute);
    expect(rows).toEqual(copy);
  });
});

describe('orderGroups', () => {
  const rows: Row[] = [
    { id: 1, route: 'A' },
    { id: 2, route: 'B' },
    { id: 3, route: 'A' },
    { id: 4, route: null },
    { id: 5, route: 'C' },
    { id: 6, route: 'C' },
  ];
  const groups = () => groupSortedRows(rows, byRoute);
  const bySize = (a: readonly Row[], b: readonly Row[]) => b.length - a.length;

  it('reorders keyed groups by the comparator and keeps members in order', () => {
    const ordered = orderGroups(groups(), bySize);
    expect(ordered.map((g) => g.rows.map((r) => r.id))).toEqual([[1, 3], [5, 6], [4], [2]]);
  });

  it('keeps ties in their incoming order', () => {
    const ordered = orderGroups(groups(), () => 0);
    expect(ordered.map((g) => g.key)).toEqual(['A', 'B', null, 'C']);
  });

  it('leaves a null-key singleton where it was', () => {
    const ordered = orderGroups(groups(), bySize);
    expect(ordered[2]?.key).toBeNull();
    const reversed = orderGroups(groups(), (a, b) => b[0]!.id - a[0]!.id);
    expect(reversed.map((g) => g.key)).toEqual(['C', 'B', null, 'A']);
  });

  it('returns the groups untouched without a comparator', () => {
    const g = groups();
    expect(orderGroups(g, undefined)).toBe(g);
  });
});
