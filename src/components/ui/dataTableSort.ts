import type { DataTableColumn, DataTableSort } from './DataTable';

const collator = new Intl.Collator();

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

export function sortRows<T>(
  rows: readonly T[],
  column: Pick<DataTableColumn<T>, 'sortValue'>,
  direction: 'asc' | 'desc'
): T[] {
  return column.sortValue ? sortRowsBy(rows, column.sortValue, direction) : [...rows];
}

export function sortRowsBy<T>(
  rows: readonly T[],
  sortValue: (row: T) => string | number | undefined,
  direction: 'asc' | 'desc'
): T[] {
  const withValue: { row: T; value: string | number }[] = [];
  const withoutValue: T[] = [];
  for (const row of rows) {
    const value = sortValue(row);
    if (value === undefined) withoutValue.push(row);
    else withValue.push({ row, value });
  }
  const sign = direction === 'asc' ? 1 : -1;
  withValue.sort((a, b) => compareValues(a.value, b.value) * sign);
  return [...withValue.map((entry) => entry.row), ...withoutValue];
}

export function firstSortDirection<T>(
  column: Pick<DataTableColumn<T>, 'sortValue' | 'sortFirst'>,
  rows: readonly T[]
): 'asc' | 'desc' {
  if (column.sortFirst) return column.sortFirst;
  if (!column.sortValue) return 'asc';
  for (const row of rows) {
    const value = column.sortValue(row);
    if (value !== undefined) return typeof value === 'number' ? 'desc' : 'asc';
  }
  return 'asc';
}

export function nextDataTableSort(
  previous: DataTableSort | null,
  columnId: string,
  firstDirection: 'asc' | 'desc' = 'asc'
): DataTableSort {
  return previous?.columnId === columnId
    ? { columnId, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
    : { columnId, direction: firstDirection };
}
