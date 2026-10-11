/**
 * The Overview's one table: what the Table view draws, and what the Chart view
 * draws beside its chart at Large and Full.
 *
 * Single-line rows, a header in the micro style (only when a column has a
 * label), tabular numerals, numeric columns right-aligned, a severity icon
 * before the first cell of a toned row, the first column truncated, and the
 * whole row a link when it has a `to` (the trailing caret is the §6c cue).
 * No row buttons and no other chrome: the widget's title link and the row's own
 * link are the only ways out. Columns are chosen by `visibleColumns` from the
 * width budget the caller passes, never from the viewport.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { IskAmount, RowCaret, SEVERITY_TEXT, SeverityIcon } from '@/components/ui';
import { rowInteractiveClassName } from '@/components/ui/controlStyles';
import { RowTappableContext } from '@/components/ui/tooltipHold';
import { cx } from '@/lib/cx';
import type { TableCell, TableColumn, TableModel, TableRowModel } from './data/types';
import type { WidgetSize } from './kinds';
import { visibleColumns } from './tableModel';

export interface TableBodyProps {
  table: TableModel;
  /** The width budget, which decides how many columns fit (not necessarily the widget's own size). */
  columnsFor: WidgetSize;
  /** The most rows to draw; the rest become a "+N more" line. */
  rowLimit: number;
  className?: string;
}

function cellText(cell: TableCell): string {
  return typeof cell === 'string' ? cell : cell.text;
}

const CELL_TONE = { good: 'text-success', caution: 'text-warning', bad: 'text-danger' } as const;

/** At Small the bar is half as long: the first column keeps the width, the bar is only decoration. */
function CellValue({ cell, compact }: { cell: TableCell; compact: boolean }) {
  if (typeof cell === 'string') return <>{cell}</>;
  if ('iskAmount' in cell) return <IskAmount value={cell.iskAmount} decimals={0} />;
  if (cell.bar === undefined) return <>{cell.text}</>;
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cx('h-1.5 overflow-hidden rounded-xs bg-line', compact ? 'w-6' : 'w-12')}
      >
        <span
          className="block h-full bg-accent"
          style={{ width: `${Math.round(Math.min(1, Math.max(0, cell.bar)) * 100)}%` }}
        />
      </span>
      {cell.text}
    </span>
  );
}

function cellToneClass(cell: TableCell): string | undefined {
  if (typeof cell === 'string' || !('tone' in cell) || cell.tone === undefined) return undefined;
  return CELL_TONE[cell.tone];
}

const cellPad = 'pl-3 first:pl-3 last:pr-3';

function Row({
  row,
  columns,
  indexes,
  caret,
  compact,
}: {
  row: TableRowModel;
  columns: readonly TableColumn[];
  /** Which of `row.cells` each visible column reads. */
  indexes: readonly number[];
  caret: boolean;
  compact: boolean;
}) {
  const toned = row.tone !== undefined && row.tone !== 'clear';
  // The icon (colour plus shape) marks only what needs a decision; a "watch" row just tints its figure.
  const flagged = row.tone === 'warning' || row.tone === 'critical';
  const linked = row.to !== undefined;
  return (
    <tr
      className={cx(
        'group relative border-b border-line last:border-b-0',
        linked ? 'h-11 md:h-7' : 'h-8 md:h-7',
        linked && rowInteractiveClassName
      )}
    >
      {columns.map((column, i) => {
        const cell = row.cells[indexes[i]];
        if (cell === undefined) return <td key={column.key} className={cellPad} />;
        const first = i === 0;
        const text = cellText(cell);
        const cellTone = cellToneClass(cell);
        return (
          <td
            key={column.key}
            className={cx(
              cellPad,
              'py-0.5 text-[0.8125rem] tabular-nums',
              first ? 'w-full max-w-0' : 'whitespace-nowrap',
              column.align === 'end' && 'text-right',
              first && 'font-semibold',
              !first && column.align !== 'end' && !cellTone && 'text-text-dim',
              !first &&
                column.align === 'end' &&
                !cellTone &&
                (toned && row.tone ? SEVERITY_TEXT[row.tone] : 'text-text'),
              !first && cellTone
            )}
          >
            {first ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="flex size-4 shrink-0 items-center">
                  {flagged && row.tone && <SeverityIcon severity={row.tone} size="0.875rem" />}
                </span>
                {linked && row.to !== undefined ? (
                  <RowTappableContext.Provider value>
                    <Link
                      to={row.to}
                      title={text}
                      className={cx(
                        'min-w-0 truncate outline-none after:absolute after:inset-0 after:content-[""]',
                        'focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent'
                      )}
                    >
                      {text}
                    </Link>
                  </RowTappableContext.Provider>
                ) : (
                  <span className="min-w-0 truncate" title={text}>
                    {text}
                  </span>
                )}
              </span>
            ) : (
              <CellValue cell={cell} compact={compact} />
            )}
          </td>
        );
      })}
      {caret && (
        <td aria-hidden="true" className="w-5 pr-2">
          {linked && <RowCaret />}
        </td>
      )}
    </tr>
  );
}

export function TableBody({ table, columnsFor, rowLimit, className }: TableBodyProps) {
  const { t } = useTranslation();
  const columns = visibleColumns(table.columns, columnsFor);
  const indexes = columns.map((column) => table.columns.indexOf(column));
  const shown = table.rows.slice(0, rowLimit);
  const more = table.rows.length - shown.length;
  if (shown.length === 0) return null;
  const hasHeader = columns.some((column) => column.label !== '');
  const caret = shown.some((row) => row.to !== undefined);
  return (
    <div className={className}>
      <table className="w-full border-collapse">
        {hasHeader && (
          <thead>
            <tr className="border-b border-line">
              {columns.map((column, i) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cx(
                    cellPad,
                    'py-1 text-[0.6875rem] font-semibold tracking-widest whitespace-nowrap text-text-dim uppercase',
                    i === 0 ? 'text-left' : column.align === 'end' ? 'text-right' : 'text-left'
                  )}
                >
                  {column.label}
                </th>
              ))}
              {caret && <th aria-hidden="true" className="w-5" />}
            </tr>
          </thead>
        )}
        <tbody>
          {shown.map((row) => (
            <Row
              key={row.key}
              row={row}
              columns={columns}
              indexes={indexes}
              caret={caret}
              compact={columnsFor === 'S'}
            />
          ))}
        </tbody>
      </table>
      {more > 0 && (
        <p className="border-t border-line px-3 py-1.5 text-[0.6875rem] text-text-dim">
          {t('overview.widgets.moreRows', { count: more })}
        </p>
      )}
      {table.footer && (
        <p className="border-t border-line px-3 py-1.5 text-[0.6875rem] text-text-dim">
          {table.footer}
        </p>
      )}
    </div>
  );
}
