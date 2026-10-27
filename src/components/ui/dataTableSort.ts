import type { DataTableColumn, DataTableSort } from './DataTable';

/**
 * Built once: `localeCompare` resolves a collator per call, and a sort makes
 * n log n of them. Default options on purpose — the same ordering (ties
 * included) that a bare `localeCompare` gives.
 */
const collator = new Intl.Collator();

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Stable: ties and rows with no sort value keep their original relative
 * order. Its own module (not `DataTable.tsx`) so exporting it doesn't mix a
 * plain function into a component file — a caller rendering its own layout
 * instead of `DataTable` (a phone-only card list, say) sorts by the same
 * rule rather than reimplementing it. See `OpportunitiesPanel`'s mobile list.
 */
export function sortRows<T>(
  rows: readonly T[],
  column: Pick<DataTableColumn<T>, 'sortValue'>,
  direction: 'asc' | 'desc'
): T[] {
  return column.sortValue ? sortRowsBy(rows, column.sortValue, direction) : [...rows];
}

/** `sortRows` given the one `sortValue` directly — what `DataTable` keys its memo on. */
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

/**
 * Same toggle rule the header click uses: clicking the active column flips
 * direction, clicking a different one starts it at `asc`. Exported for the
 * same reason as `sortRows` — a caller keeping its own `DataTableSort` state
 * outside `DataTable` (no header row to click) still needs the identical rule.
 */
export function nextDataTableSort(previous: DataTableSort | null, columnId: string): DataTableSort {
  return previous?.columnId === columnId
    ? { columnId, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
    : { columnId, direction: 'asc' };
}
