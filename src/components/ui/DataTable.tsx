import type { ReactNode } from 'react';

/** Joins present class fragments, so an absent optional never leaves a double space. */
function cx(...parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
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
 * Dense table matching the markup the routes already hand-roll, so migrating a
 * call site is visually a no-op. Headers and cell content arrive already
 * translated — this component adds no i18n keys of its own.
 *
 * Presentational only: no sort state. Every table in the app pre-sorts in its
 * own `useMemo`, so sorting would be unused generality; it lands when a call
 * site asks for it.
 *
 * Renders nothing but the table — callers branch to `EmptyState` when `rows` is
 * empty, per docs/DESIGN.md §4 ("Never show a bare empty table").
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  label,
  className = '',
}: DataTableProps<T>) {
  return (
    <table aria-label={label} className={cx('w-full text-xs', className)}>
      <thead>
        <tr className="border-b border-line text-left text-text-dim">
          {columns.map((column) => (
            <th
              key={column.id}
              scope="col"
              className={cx(
                'px-3 py-2 font-semibold uppercase',
                column.align === 'right' ? 'text-right' : undefined
              )}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((row) => (
          <tr key={rowKey(row)} className={cx('hover:bg-panel-2', rowClassName?.(row))}>
            {columns.map((column) => (
              <td
                key={column.id}
                className={cx(
                  'px-3 py-1.5',
                  column.align === 'right' ? 'text-right' : undefined,
                  column.className,
                  column.cellClassName?.(row)
                )}
              >
                {column.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
