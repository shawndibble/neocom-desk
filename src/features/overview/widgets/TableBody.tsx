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
import type { TFunction } from 'i18next';
import { IskAmount, RowCaret, SEVERITY_TEXT, SeverityIcon } from '@/components/ui';
import { rowInteractiveClassName } from '@/components/ui/controlStyles';
import { RowTappableContext } from '@/components/ui/tooltipHold';
import { cx } from '@/lib/cx';
import type { TableCell, TableColumn, TableModel, TableRowModel } from './data/types';
import type { WidgetSize } from './kinds';
import { fractionBar, type CellTone } from './data/cellKit';
import { visibleColumns } from './tableModel';

export interface TableBodyProps {
  table: TableModel;
  /** The width budget, which decides how many columns fit (not necessarily the widget's own size). */
  columnsFor: WidgetSize;
  /** The most rows to draw; the rest become a "+N more" line. */
  rowLimit: number;
  /** The table's accessible name: the widget's title. */
  ariaLabel?: string;
  className?: string;
}

function cellText(cell: TableCell): string {
  return typeof cell === 'string' ? cell : cell.text;
}

/** A cell that already starts with a sign says which way it went without its colour. */
const SIGNS = [String.fromCharCode(43), String.fromCharCode(45), String.fromCharCode(0x2212)];

const TONE_WORD: Record<CellTone, (t: TFunction) => string> = {
  good: (t) => t('overview.widgets.tone.good'),
  caution: (t) => t('overview.widgets.tone.caution'),
  bad: (t) => t('overview.widgets.tone.bad'),
};

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
          style={{ width: `${Math.round((fractionBar(cell.bar, 1) ?? 0) * 100)}%` }}
        />
      </span>
      {cell.text}
    </span>
  );
}

function cellTone(cell: TableCell): CellTone | undefined {
  if (typeof cell === 'string' || !('tone' in cell)) return undefined;
  return cell.tone;
}

const cellPad = 'pl-3 last:pr-3';

/** A `wide` column is hidden until its widget is 28rem across (see `TableColumn.wide`). */
const WIDE_ONLY = 'hidden @md:table-cell';

function Row({
  row,
  columns,
  indexes,
  caret,
  compact,
  rowHeader,
  growKey,
}: {
  row: TableRowModel;
  columns: readonly TableColumn[];
  /** Which of `row.cells` each visible column reads. */
  indexes: readonly number[];
  caret: boolean;
  compact: boolean;
  /** No header row: the first cell names the row for a screen reader. */
  rowHeader: boolean;
  /** The visible column that truncates in the first one's place, when a table has one. */
  growKey: string | undefined;
}) {
  const { t } = useTranslation();
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
        const tone = cellTone(cell);
        const toneClass = tone === undefined ? undefined : CELL_TONE[tone];
        const Cell = first && rowHeader ? 'th' : 'td';
        return (
          <Cell
            scope={first && rowHeader ? 'row' : undefined}
            key={column.key}
            className={cx(
              cellPad,
              column.wide && WIDE_ONLY,
              'py-0.5 text-[0.8125rem] tabular-nums',
              column.key === growKey
                ? 'w-full max-w-0 truncate whitespace-nowrap'
                : first
                  ? growKey === undefined
                    ? 'w-full max-w-0 min-w-28'
                    : 'max-w-40'
                  : 'whitespace-nowrap',
              column.align === 'end' && 'text-right',
              Cell === 'th' && 'text-left',
              first && 'font-semibold',
              !first && column.align !== 'end' && !toneClass && 'text-text-dim',
              !first &&
                column.align === 'end' &&
                !toneClass &&
                (toned && row.tone ? SEVERITY_TEXT[row.tone] : 'text-text'),
              !first && toneClass
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
                      className={cx(
                        'min-w-0 truncate outline-none after:absolute after:inset-0 after:content-[""]',
                        'focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent'
                      )}
                    >
                      {text}
                    </Link>
                  </RowTappableContext.Provider>
                ) : (
                  <span className="min-w-0 truncate">{text}</span>
                )}
              </span>
            ) : (
              <>
                <CellValue cell={cell} compact={compact} />
                {tone !== undefined && !SIGNS.some((sign) => text.startsWith(sign)) && (
                  <>
                    {' '}
                    <span className="sr-only">{TONE_WORD[tone](t)}</span>
                  </>
                )}
              </>
            )}
          </Cell>
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

export function TableBody({ table, columnsFor, rowLimit, ariaLabel, className }: TableBodyProps) {
  const { t } = useTranslation();
  const columns = visibleColumns(table.columns, columnsFor);
  const indexes = columns.map((column) => table.columns.indexOf(column));
  const shown = table.rows.slice(0, rowLimit);
  const more = table.rows.length - shown.length;
  if (shown.length === 0) return null;
  const hasHeader = columns.some((column) => column.label !== '');
  const growKey = columns.find((column, i) => i > 0 && column.grow)?.key;
  const caret = shown.some((row) => row.to !== undefined);
  return (
    <div className={cx('@container', className)}>
      <table aria-label={ariaLabel} className="w-full border-collapse">
        {hasHeader && (
          <thead>
            <tr className="border-b border-line">
              {columns.map((column, i) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cx(
                    cellPad,
                    column.wide && WIDE_ONLY,
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
              rowHeader={!hasHeader}
              growKey={growKey}
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
