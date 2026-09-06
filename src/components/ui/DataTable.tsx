import { Fragment, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import * as Icon from './icons';
import { InfoTooltip } from './Tooltip';

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
  /**
   * Static header classes — for a short multi-word header (e.g. "ISK / LP")
   * that should stay on one line rather than wrap when its column is
   * squeezed. Separate from `className` (cell-only) since a cell tone like
   * `text-text-dim` has no business on the header.
   */
  headerClassName?: string;
  /**
   * One-line plain-language note on what the column's values *are*, shown as
   * a small info control beside the header text — e.g. that a ledger date is
   * an EVE/UTC calendar day, not a local one. Only for a genuine ambiguity a
   * reader could get wrong; most columns explain themselves.
   */
  headerTooltip?: string;
  render: (row: T) => ReactNode;
  /**
   * Declares the column sortable and extracts its comparable value.
   * `undefined` sinks the row to the end, in either direction, rather than
   * being treated as zero.
   */
  sortValue?: (row: T) => string | number | undefined;
  /**
   * Names the row in the stacked (below-`sm`) layout: this cell becomes the
   * card's title — hoisted to the top, unlabelled, semibold — while the rest
   * stay label/value pairs. Defaults to the first column, which is usually
   * right. Set it where reading order and identity disagree: a wallet journal
   * leads with the date because a ledger should, but a card titled
   * "9/1/2026, 9:34:21 PM" says nothing, so its `refType` claims this instead.
   * At most one column per table; later ones are ignored.
   */
  primary?: boolean;
  /**
   * Pins this cell to the stacked card's top-right corner instead of its own
   * labelled row — for a purely decorative, non-tabular cell (an affordance
   * icon) that reads as a stray unlabelled line when stacked normally. At
   * most one column per table; later ones are ignored.
   */
  cardCorner?: boolean;
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
  /** `'compact'` tightens header and cell padding on both axes. Table-level, not per-column — a table is compact as a whole. */
  density?: 'default' | 'compact';
  /**
   * Wraps a row's `<tr>` — e.g. a right-click menu. When set, the `<tr>`
   * gets `tabIndex={0}` so a keyboard user can focus it and open the menu
   * with Shift+F10 / the Menu key, the same way `ContextMenu.test.tsx`
   * drives a focused trigger.
   */
  rowContextMenu?: (row: T, tr: ReactElement) => ReactElement;
  /**
   * Makes the whole row a click target — e.g. re-anchoring the page on the
   * row's item, rather than requiring a click on one specific cell. Also
   * gets `tabIndex={0}` and responds to Enter/Space, same focus treatment as
   * `rowContextMenu`.
   */
  onRowClick?: (row: T) => void;
  /**
   * How the table behaves below `sm`. `'stack'` (the default) collapses each
   * row into a labelled card — see `.dt-stack` in `src/styles/index.css`.
   * `'table'` keeps real columns, and is only right for a table narrow enough
   * to fit a 390px screen unaided — roughly two short columns.
   */
  responsive?: 'stack' | 'table';
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
 *
 * Below `sm` the rows collapse into labelled cards (`responsive`), which is
 * pure CSS — the markup below is what every width renders. Because that CSS
 * makes the elements `display: block`, which strips their implicit ARIA
 * roles, each one states its table role explicitly.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  label,
  className = '',
  defaultSort,
  density = 'default',
  rowContextMenu,
  onRowClick,
  responsive = 'stack',
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [sort, setSort] = useState<DataTableSort | null>(defaultSort ?? null);

  const headerPadding = density === 'compact' ? 'px-2 py-1' : 'px-3 py-2';
  const cellPadding = density === 'compact' ? 'px-2 py-1' : 'px-3 py-1.5';

  // Per-column classes are invariant across rows, so they are built once
  // rather than per cell — a 1,000-row journal is 5,000 cells.
  // A plain header carries these on the `<th>`; a sortable one moves them
  // onto its button (the `<th>` goes padding-free) so the whole cell is the
  // click target.
  const headerTextClass = columns.map((column) =>
    cx(
      headerPadding,
      'font-semibold uppercase',
      column.align === 'right' && 'text-right',
      column.headerClassName
    )
  );
  // Which cell titles the card once the rows stack. Marked on every row's
  // cell rather than positionally, so `.dt-stack` can hoist it out of column
  // order without the markup differing by width.
  const primaryIndex = Math.max(
    0,
    columns.findIndex((column) => column.primary)
  );
  const cardCornerIndex = columns.findIndex((column) => column.cardCorner);
  // A right-aligned sortable header's own sort glyph (`gap-1` + an icon) sits
  // between the label and the header's right inset, pushing the label ~1rem
  // further left than a plain right-aligned cell below it — same horizontal
  // padding otherwise, on both header and cell. Nudging just these cells'
  // right padding by that same amount brings the numbers back under the
  // label a reader's eye actually lands on, not under the icon.
  const sortIconGutter = density === 'compact' ? 'pr-6' : 'pr-7';
  const cellClass = columns.map((column) =>
    cx(
      cellPadding,
      column.align === 'right' && 'text-right',
      column.align === 'right' && column.sortValue && sortIconGutter,
      column.className
    )
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
    <table
      role="table"
      aria-label={label}
      className={cx('w-full text-xs', responsive === 'stack' && 'dt-stack', className)}
    >
      <thead role="rowgroup">
        <tr role="row" className="border-b border-line text-left text-text-dim">
          {columns.map((column, i) => {
            const sortable = column.sortValue !== undefined;
            const active = sortable && sort?.columnId === column.id;
            const direction = active ? sort.direction : undefined;
            // Unsorted columns get the neutral up/down glyph, so a sortable
            // column advertises itself before anyone clicks it.
            const SortGlyph = !active
              ? Icon.Sort
              : direction === 'asc'
                ? Icon.Ascending
                : Icon.Descending;
            // Its own `<button>`, beside the sort button rather than inside
            // it (nested buttons are invalid HTML).
            const info = column.headerTooltip && (
              <InfoTooltip
                label={t('common.aboutLabel', { label: column.header })}
                content={column.headerTooltip}
                className={cx('normal-case', sortable && (density === 'compact' ? 'mr-2' : 'mr-3'))}
              />
            );
            return (
              <th
                key={column.id}
                role="columnheader"
                scope="col"
                className={sortable ? 'p-0' : headerTextClass[i]}
                aria-sort={
                  sortable
                    ? active
                      ? direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                    : undefined
                }
              >
                {sortable ? (
                  <span className="flex items-center">
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={cx(
                        headerTextClass[i],
                        'inline-flex flex-1 items-center gap-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                        column.align === 'right' && 'justify-end'
                      )}
                    >
                      {column.header}
                      <SortGlyph
                        aria-hidden="true"
                        size={Icon.ICON_SIZE.sm}
                        className={cx('shrink-0', active ? 'text-accent' : 'text-text-faint')}
                      />
                    </button>
                    {info}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1">
                    {column.header}
                    {info}
                  </span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody role="rowgroup" className="divide-y divide-line">
        {sortedRows.map((row) => {
          const focusable = Boolean(rowContextMenu) || Boolean(onRowClick);
          const tr = (
            <tr
              role="row"
              className={cx(
                'hover:bg-panel-2',
                onRowClick && 'cursor-pointer',
                focusable &&
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                rowClassName?.(row)
              )}
              tabIndex={focusable ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onRowClick(row);
                    }
                  : undefined
              }
            >
              {columns.map((column, i) => (
                <td
                  key={column.id}
                  role="cell"
                  // Printed as the cell's label in the stacked layout. Set
                  // unconditionally: it costs one static attribute and keeps
                  // the markup width-independent.
                  data-label={column.header}
                  className={cx(
                    cellClass[i],
                    i === primaryIndex && 'dt-primary',
                    i === cardCornerIndex && 'dt-corner',
                    column.cellClassName?.(row)
                  )}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          );
          return (
            <Fragment key={rowKey(row)}>{rowContextMenu ? rowContextMenu(row, tr) : tr}</Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
