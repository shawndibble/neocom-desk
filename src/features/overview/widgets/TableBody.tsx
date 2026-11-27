import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Button,
  IconButton,
  IskAmount,
  RowCaret,
  SEVERITY_TEXT,
  SegmentedControl,
  SeverityIcon,
} from '@/components/ui';
import { focusRingInsetClassName, rowInteractiveClassName } from '@/components/ui/controlStyles';
import { firstSortDirection, nextDataTableSort } from '@/components/ui/dataTableSort';
import * as Icon from '@/components/ui/icons';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { RowTappableContext } from '@/components/ui/tooltipHold';
import { HintText } from '@/components/ui/HintText';
import { ShareMark } from '@/components/ui/ShareMark';
import { Pill } from '@/components/ui/Pill';
import { openItemInfo } from '@/stores/itemInfoModal';
import { cx } from '@/lib/cx';
import type { TableCell, TableColumn, TableModel, TableRowModel } from './data/types';
import type { WidgetSize } from './kinds';
import { fractionBar, type CellTone } from './data/cellKit';
import { RowDetailModal } from './RowDetailModal';
import { fitColumns, visibleColumns } from './tableModel';
import { ROW_TARGET_CLASS } from './rowTarget';
import {
  ROWS_PER_PAGE_OPTIONS,
  clampPage,
  isRowsPerPage,
  pageCount,
  pageRange,
  pageRows,
  sortTableRows,
  type RowsPerPage,
} from './tableSortPage';

const TurnInRowTrigger = lazy(() => import('./TurnInRowTrigger'));

export interface TableBodyProps {
  table: TableModel;
  columnsFor: WidgetSize;
  rowLimit: number;
  paging?: { rowsPerPage: RowsPerPage; onRowsPerPage: (rows: RowsPerPage) => void };
  ariaLabel?: string;
  className?: string;
}

function cellText(cell: TableCell): string {
  return typeof cell === 'string' ? cell : cell.text;
}

const SIGNS = [String.fromCharCode(43), String.fromCharCode(45), String.fromCharCode(0x2212)];

const TONE_WORD: Record<CellTone, (t: TFunction) => string> = {
  good: (t) => t('overview.widgets.tone.good'),
  caution: (t) => t('overview.widgets.tone.caution'),
  bad: (t) => t('overview.widgets.tone.bad'),
};

const CELL_TONE = { good: 'text-success', caution: 'text-warning', bad: 'text-danger' } as const;

function CellValue({ cell, compact }: { cell: TableCell; compact: boolean }) {
  if (typeof cell === 'string') return <>{cell}</>;
  if ('iskAmount' in cell) {
    const amount = <IskAmount value={cell.iskAmount} decimals={0} />;
    return cell.prefix === undefined ? (
      amount
    ) : (
      <>
        {cell.prefix} {amount}
      </>
    );
  }
  if ('hint' in cell) return <HintText content={cell.hint}>{cell.text}</HintText>;
  if ('share' in cell) {
    return (
      <span className="inline-flex max-w-full items-center gap-1.5">
        <span className="truncate">{cell.text}</span>
        <ShareMark label={cell.share.label} off={cell.share.off} />
      </span>
    );
  }
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
const ICON_SLOT_INDENT = 'pl-[2.125rem] last:pr-3';

function isFlagged(row: Pick<TableRowModel, 'tone'>): boolean {
  return row.tone === 'warning' || row.tone === 'critical';
}

const CARET_WIDTH = 20;

const HIDE_NARROW = 'hidden @md:table-cell';

const FIRST_BESIDE_CAPPED = 'max-w-[60cqw]';
const FIRST_BESIDE_NARROW_CAPPED = 'w-full max-w-0 @md:w-auto @md:max-w-[60cqw]';

function Row({
  row,
  columns,
  indexes,
  caret,
  compact,
  rowHeader,
  growKey,
  firstCellClass,
  iconSlot,
  onOpen,
}: {
  row: TableRowModel;
  columns: readonly TableColumn[];
  indexes: readonly number[];
  caret: boolean;
  compact: boolean;
  rowHeader: boolean;
  growKey: string | undefined;
  firstCellClass: string;
  iconSlot: boolean;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  const toned = row.tone !== undefined && row.tone !== 'clear';
  const flagged = isFlagged(row);
  const linked = row.to !== undefined;
  const turnIn = row.turnIn;
  const opens = onOpen !== undefined || turnIn !== undefined;
  return (
    <tr
      className={cx(
        'group relative border-b border-line last:border-b-0',
        linked || opens ? 'h-9 md:h-7' : 'h-8 md:h-7',
        (linked || opens) && rowInteractiveClassName
      )}
    >
      {columns.map((column, i) => {
        const cell = row.cells[indexes[i]];
        if (cell === undefined) return <td key={column.key} className={cellPad} />;
        const first = i === 0;
        const trailingHidden =
          columns.slice(i + 1).length > 0 && columns.slice(i + 1).every((c) => c.hideNarrow);
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
              column.hideNarrow && HIDE_NARROW,
              trailingHidden && 'pr-3 @md:pr-0',
              'py-0.5 text-sm tabular-nums',
              column.key === growKey
                ? 'w-full max-w-0 truncate whitespace-nowrap'
                : first
                  ? growKey === undefined
                    ? cx('w-full max-w-0', column.nameFloor && 'min-w-28')
                    : firstCellClass
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
                {iconSlot && (
                  <span className="flex size-4 shrink-0 items-center">
                    {flagged && row.tone && <SeverityIcon severity={row.tone} size="0.875rem" />}
                  </span>
                )}
                {row.badge !== undefined && <Pill className="shrink-0">{row.badge}</Pill>}
                {turnIn !== undefined ? (
                  <Suspense fallback={<span className="min-w-0 truncate">{text}</span>}>
                    <TurnInRowTrigger turnIn={turnIn} text={text} />
                  </Suspense>
                ) : linked && row.to !== undefined ? (
                  <RowTappableContext.Provider value>
                    <Link to={row.to} className={ROW_TARGET_CLASS}>
                      {text}
                    </Link>
                  </RowTappableContext.Provider>
                ) : opens ? (
                  <RowTappableContext.Provider value>
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={onOpen}
                      className={entityLinkClassName(cx(ROW_TARGET_CLASS, 'text-left'))}
                    >
                      {text}
                    </button>
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

function SortableLabel({
  column,
  direction,
  onSort,
}: {
  column: TableColumn;
  direction: 'asc' | 'desc' | null;
  onSort: () => void;
}) {
  const { t } = useTranslation();
  const active = direction !== null;
  const SortGlyph = !active ? Icon.Sort : direction === 'asc' ? Icon.Ascending : Icon.Descending;
  const label = active
    ? t(`overview.widgets.table.${direction === 'asc' ? 'sortedAsc' : 'sortedDesc'}`, {
        column: column.label,
      })
    : t('overview.widgets.table.sortBy', { column: column.label });
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onSort}
      className={cx(
        'inline-flex items-center gap-1 uppercase hover:text-text active:text-text-dim min-h-9 md:min-h-0 touch:min-h-9',
        focusRingInsetClassName,
        active && 'text-text',
        column.align === 'end' && 'flex-row-reverse'
      )}
    >
      {column.label}
      <SortGlyph
        aria-hidden="true"
        size={Icon.ICON_SIZE.sm}
        className={cx('shrink-0', active ? 'text-accent' : 'text-text-faint')}
      />
    </button>
  );
}

function Pager({
  page,
  total,
  perPage,
  onPage,
  onRowsPerPage,
}: {
  page: number;
  total: number;
  perPage: RowsPerPage;
  onPage: (page: number) => void;
  onRowsPerPage: (rows: RowsPerPage) => void;
}) {
  const { t } = useTranslation();
  const { from, to } = pageRange(page, total, perPage);
  const last = pageCount(total, perPage);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-line px-3 py-1.5">
      <SegmentedControl
        label={t('overview.widgets.table.rowsPerPage')}
        size="sm"
        uppercase={false}
        value={String(perPage)}
        options={ROWS_PER_PAGE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
        onChange={(value) => {
          const next = Number(value);
          if (isRowsPerPage(next)) onRowsPerPage(next);
        }}
      />
      <div className="flex items-center gap-1.5">
        <span aria-live="polite" className="text-[0.6875rem] text-text-dim tabular-nums">
          {t('overview.widgets.table.pageStatus', { from, to, count: total })}
        </span>
        <IconButton
          size="sm"
          icon={<Icon.Back />}
          label={t('overview.widgets.table.previousPage')}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        />
        <IconButton
          size="sm"
          icon={<Icon.Descend />}
          label={t('overview.widgets.table.nextPage')}
          disabled={page >= last}
          onClick={() => onPage(page + 1)}
        />
      </div>
    </div>
  );
}

export function TableBody({
  table,
  columnsFor,
  rowLimit,
  paging,
  ariaLabel,
  className,
}: TableBodyProps) {
  const { t } = useTranslation();
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState<number | null>(null);
  const fit = table.fitWidth === true;
  useLayoutEffect(() => {
    if (!fit || !box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[entries.length - 1]?.contentRect.width;
      if (width !== undefined) setBoxWidth(Math.round(width));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, [fit, box]);
  const budgeted = visibleColumns(table.columns, columnsFor);
  const caretWidth = table.rows.some((row) => row.to !== undefined) ? CARET_WIDTH : 0;
  const columns = fit && boxWidth !== null ? fitColumns(budgeted, boxWidth - caretWidth) : budgeted;
  const indexes = columns.map((column) => table.columns.indexOf(column));
  const [sort, setSort] = useState<{ columnId: string; direction: 'asc' | 'desc' } | null>(null);
  const [opened, setOpened] = useState<TableRowModel | null>(null);
  const [expanded, setExpanded] = useState(false);
  const revealFocus = useRef(false);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [pageState, setPageState] = useState({ page: 1, perPage: paging?.rowsPerPage });
  const activeSort = sort && columns.some((column) => column.key === sort.columnId) ? sort : null;
  const sorted = useMemo(() => {
    const index = activeSort
      ? table.columns.findIndex((column) => column.key === activeSort.columnId)
      : -1;
    return activeSort && index >= 0
      ? sortTableRows(table.rows, index, activeSort.direction)
      : table.rows;
  }, [table, activeSort]);

  useEffect(() => {
    if (!expanded || !revealFocus.current) return;
    revealFocus.current = false;
    const row = bodyRef.current?.rows[rowLimit];
    if (!row) return;
    const target = row.querySelector<HTMLElement>('a[href], button') ?? row;
    if (target === row) row.tabIndex = -1;
    target.focus();
  }, [expanded, rowLimit]);

  const pageable = table.pageable === true && paging !== undefined;
  const paged = pageable && sorted.length > ROWS_PER_PAGE_OPTIONS[0];
  const requested = pageState.perPage === paging?.rowsPerPage ? pageState.page : 1;
  const page = paged && paging ? clampPage(requested, sorted.length, paging.rowsPerPage) : 1;
  const shown =
    paged && paging
      ? pageRows(sorted, page, paging.rowsPerPage)
      : pageable
        ? sorted
        : expanded
          ? sorted
          : sorted.slice(0, rowLimit);
  const more = paged ? 0 : sorted.length - shown.length;
  const cuttable = !paged && !pageable && sorted.length > rowLimit;
  if (shown.length === 0) {
    return table.emptyLine === undefined ? null : (
      <p className={cx('px-3 py-2 text-sm text-text-dim', className)}>{table.emptyLine}</p>
    );
  }
  const hasHeader = columns.some((column) => column.label !== '');
  const growColumn = columns.find((column, i) => i > 0 && (column.grow || column.capped));
  const growKey = growColumn?.key;
  const firstCellClass = !growColumn?.capped
    ? 'max-w-40'
    : growColumn.hideNarrow
      ? FIRST_BESIDE_NARROW_CAPPED
      : FIRST_BESIDE_CAPPED;
  const caret = shown.some((row) => row.to !== undefined);
  const iconSlot = table.rows.some(isFlagged);
  return (
    <div ref={setBox} className={cx('@container', className)}>
      <table aria-label={ariaLabel} className="w-full border-collapse">
        {hasHeader && (
          <thead>
            <tr className="border-b border-line">
              {columns.map((column, i) => {
                const direction = activeSort?.columnId === column.key ? activeSort.direction : null;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      column.sortable
                        ? direction === null
                          ? 'none'
                          : direction === 'asc'
                            ? 'ascending'
                            : 'descending'
                        : undefined
                    }
                    className={cx(
                      i === 0 && iconSlot ? ICON_SLOT_INDENT : cellPad,
                      column.hideNarrow && HIDE_NARROW,
                      eyebrowClassName,
                      'py-1 whitespace-nowrap',
                      i === 0 ? 'text-left' : column.align === 'end' ? 'text-right' : 'text-left'
                    )}
                  >
                    {column.sortable ? (
                      <SortableLabel
                        column={column}
                        direction={direction}
                        onSort={() => {
                          setSort(
                            nextDataTableSort(
                              sort,
                              column.key,
                              firstSortDirection(
                                { sortValue: (row) => row.sort?.[table.columns.indexOf(column)] },
                                table.rows
                              )
                            )
                          );
                          setPageState({ page: 1, perPage: paging?.rowsPerPage });
                        }}
                      />
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
              {caret && <th aria-hidden="true" className="w-5" />}
            </tr>
          </thead>
        )}
        <tbody ref={bodyRef}>
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
              firstCellClass={firstCellClass}
              iconSlot={iconSlot}
              onOpen={
                row.detail !== undefined
                  ? () => setOpened(row)
                  : row.info !== undefined
                    ? () => openItemInfo(row.info!.typeId, cellText(row.cells[0]!))
                    : undefined
              }
            />
          ))}
        </tbody>
      </table>
      {paged && paging && (
        <Pager
          page={page}
          total={sorted.length}
          perPage={paging.rowsPerPage}
          onPage={(next) => setPageState({ page: next, perPage: paging.rowsPerPage })}
          onRowsPerPage={paging.onRowsPerPage}
        />
      )}
      {cuttable && (
        <div className="border-t border-line px-3 py-1">
          <Button
            size="sm"
            onClick={() => {
              revealFocus.current = !expanded;
              setExpanded(!expanded);
            }}
          >
            {expanded
              ? t('overview.widgets.fewerRows')
              : t('overview.widgets.moreRows', { count: more })}
          </Button>
        </div>
      )}
      {table.footer && (
        <p className="border-t border-line px-3 py-1.5 text-[0.6875rem] text-text-dim">
          {table.footer}
        </p>
      )}
      <RowDetailModal detail={opened?.detail ?? null} onClose={() => setOpened(null)} />
    </div>
  );
}
