import { useMemo, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface DataTableSort {
  columnId: string;
  direction: 'asc' | 'desc';
}

export interface DataTableColumn<T> {
  id: string;
  /** Already-translated header text. */
  header: string;
  align?: 'left' | 'right';
  /** Static cell classes — `whitespace-nowrap`, `tabular-nums`, `text-text-dim`. */
  className?: string;
  /** Row-dependent cell classes, for per-value tones (`iskToneClass`, status tones). */
  cellClassName?: (row: T) => string | undefined;
  render: (row: T) => ReactNode;
  /**
   * Declares the column sortable and extracts its comparable value.
   * `undefined` sinks the row to the end, in either direction, rather than
   * being treated as zero.
   */
  sortValue?: (row: T) => string | number | undefined;
}

interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  /** Row-level classes, e.g. Contracts dimming expired rows with `opacity-50`. */
  rowClassName?: (row: T) => string | undefined;
  /** Accessible name for the table. */
  label: string;
  className?: string;
  /** Column and direction to sort by before any header click. Column must declare `sortValue`. */
  defaultSort?: DataTableSort;
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/** Stable: ties and rows with no sort value keep their original relative order. */
function sortRows<T>(
  rows: readonly T[],
  column: DataTableColumn<T>,
  direction: 'asc' | 'desc'
): T[] {
  const sortValue = column.sortValue;
  if (!sortValue) return [...rows];
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
 * Dense table. Headers and cell content arrive already translated — no i18n
 * here. No empty branch — callers show `EmptyState` instead (docs/DESIGN.md
 * §4, "Never show a bare empty table"). Sorting is opt-in per column via
 * `sortValue`: a table that declares none behaves exactly as before.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  label,
  className = '',
  defaultSort,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<DataTableSort | null>(defaultSort ?? null);

  // Per-column classes are invariant across rows, so they are built once
  // rather than per cell — a 1,000-row journal is 5,000 cells.
  const headerClass = columns.map((column) =>
    cx(
      'px-3 py-2 font-semibold uppercase',
      column.align === 'right' && 'text-right',
      column.sortValue && 'p-0'
    )
  );
  const cellClass = columns.map((column) =>
    cx('px-3 py-1.5', column.align === 'right' && 'text-right', column.className)
  );

  const sortColumn = sort ? columns.find((column) => column.id === sort.columnId) : undefined;
  const sortedRows = useMemo(() => {
    if (!sort || !sortColumn?.sortValue) return rows;
    return sortRows(rows, sortColumn, sort.direction);
  }, [rows, sort, sortColumn]);

  function toggleSort(column: DataTableColumn<T>) {
    setSort((previous) =>
      previous?.columnId === column.id
        ? { columnId: column.id, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { columnId: column.id, direction: 'asc' }
    );
  }

  return (
    <table aria-label={label} className={cx('w-full text-xs', className)}>
      <thead>
        <tr className="border-b border-line text-left text-text-dim">
          {columns.map((column, i) => {
            if (!column.sortValue) {
              return (
                <th key={column.id} scope="col" className={headerClass[i]}>
                  {column.header}
                </th>
              );
            }
            const active = sort?.columnId === column.id;
            const direction = active ? sort.direction : undefined;
            return (
              <th
                key={column.id}
                scope="col"
                className={headerClass[i]}
                aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(column)}
                  className={cx(
                    'inline-flex w-full items-center gap-1 px-3 py-2 font-semibold uppercase focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                    column.align === 'right' && 'justify-end'
                  )}
                >
                  {column.header}
                  <span aria-hidden="true" className="text-[0.6875rem]">
                    {active ? (direction === 'asc' ? '▲' : '▼') : '⇅'}
                  </span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {sortedRows.map((row) => (
          <tr key={rowKey(row)} className={cx('hover:bg-panel-2', rowClassName?.(row))}>
            {columns.map((column, i) => (
              <td key={column.id} className={cx(cellClass[i], column.cellClassName?.(row))}>
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
