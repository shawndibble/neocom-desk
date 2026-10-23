/**
 * Build Plan Compare on a phone (issue #4786): plans as columns, one metric per
 * row, so two or three plans read side by side instead of one scrolling table.
 * It draws the same `DataTable` column definitions the desktop table does: the
 * `primary` column heads each plan, every other shown column is a row, and the
 * Columns picker still decides which rows there are.
 */
import type { DataTableColumn } from '@/components/ui';
import { cx } from '@/lib/cx';

interface CompareMatrixProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Accessible name for the table. */
  label: string;
  /** The row set apart as the answer: bolder and on the panel fill. */
  emphasisColumnId?: string;
}

export function CompareMatrix<T>({
  columns,
  rows,
  rowKey,
  label,
  emphasisColumnId,
}: CompareMatrixProps<T>) {
  const head = columns.find((c) => c.primary) ?? columns[0];
  const metrics = columns.filter((c) => c !== head);
  if (!head) return null;
  return (
    <table className="w-full table-fixed text-sm tabular-nums">
      <caption className="sr-only">{label}</caption>
      <thead>
        <tr className="border-b border-line align-bottom">
          <td className="w-[28%]" />
          {rows.map((row) => (
            <th
              key={rowKey(row)}
              scope="col"
              className="min-w-0 px-2 py-3 text-right text-sm font-semibold break-words"
            >
              {head.render(row)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {metrics.map((metric) => {
          const emphasis = metric.id === emphasisColumnId;
          return (
            <tr
              key={metric.id}
              className={cx('border-b border-line last:border-b-0', emphasis && 'bg-panel-2')}
            >
              <th
                scope="row"
                className="py-2.5 pr-1 pl-3 text-left text-[0.6875rem] leading-tight font-normal tracking-widest text-text-dim uppercase"
              >
                {metric.header}
              </th>
              {rows.map((row) => (
                <td
                  key={rowKey(row)}
                  className={cx(
                    'px-2 py-2.5 text-right',
                    emphasis && 'text-base font-semibold',
                    metric.cellClassName?.(row)
                  )}
                >
                  {metric.render(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
