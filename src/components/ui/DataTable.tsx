import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

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
}

/**
 * Dense table. Headers and cell content arrive already translated — no i18n
 * here. Presentational: no sort state (every table pre-sorts in its own
 * `useMemo`), and no empty branch — callers show `EmptyState` instead
 * (docs/DESIGN.md §4, "Never show a bare empty table").
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  label,
  className = '',
}: DataTableProps<T>) {
  // Per-column classes are invariant across rows, so they are built once
  // rather than per cell — a 1,000-row journal is 5,000 cells.
  const headerClass = columns.map((column) =>
    cx('px-3 py-2 font-semibold uppercase', column.align === 'right' && 'text-right')
  );
  const cellClass = columns.map((column) =>
    cx('px-3 py-1.5', column.align === 'right' && 'text-right', column.className)
  );

  return (
    <table aria-label={label} className={cx('w-full text-xs', className)}>
      <thead>
        <tr className="border-b border-line text-left text-text-dim">
          {columns.map((column, i) => (
            <th key={column.id} scope="col" className={headerClass[i]}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
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
