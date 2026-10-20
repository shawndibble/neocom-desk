import {
  Fragment,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cx } from '@/lib/cx';
import { rootFontScale } from '@/lib/fontScale';
import { useScrollToRowKey } from '@/lib/useScrollToRowKey';
import { useIsPhone } from '@/lib/useIsPhone';
import { groupSortedRows } from './dataTableGroup';
import { nextDataTableSort, sortRowsBy } from './dataTableSort';
import { DataTableRow } from './DataTableRow';
import { DataTableHeader } from './DataTableHeader';
import { DataTableGroupHeader } from './DataTableGroupHeader';
import { DataTableSortBar } from './DataTableSortBar';
import { stickyStartClass } from './dataTableSticky';
import { useDataTableVirtualizer } from './useDataTableVirtualizer';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from './ContextMenu';
import { ExportTableItems, TableExportProvider } from './TableExport';
import { type TableExport } from './useTableExport';

import { DataTableSortPicker } from './DataTableSortPicker';
export { DataTableSortPicker };

import type { DataTableColumn, DataTableProps, DataTableSort } from './dataTableTypes';
export type {
  DataTableColumn,
  DataTableExpandableRow,
  DataTableGroupBy,
  DataTableSort,
} from './dataTableTypes';

// `hover:bg-panel-2` lives on the `<tr>`, whose own background a sticky
// cell's opaque one would otherwise cover.
const STICKY_START_CELL = 'max-sm:max-w-30 [tr:hover>&]:bg-panel-2';

/**
 * Wraps a dense-stack (`stackLayout="dense"`) column's `render` output when
 * it's more than one inline piece (a value plus a badge, a name plus a
 * security-status suffix). The dense meta line puts a `·` separator right
 * before this cell's content via CSS `::before` — a plain `flex` span
 * blockifies and breaks onto its own line whenever a separator precedes it;
 * `inline-flex` doesn't. Column authors reach for this instead of writing
 * the className themselves, so the constraint has one place to hold and fix.
 */
export function DataTableDenseCell({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{children}</span>;
}

/**
 * Row count past which `virtualize="auto"` windows. Well above a screenful,
 * so a table that only occasionally runs long pays nothing the rest of the
 * time; well below where mounting every row starts to show (a few hundred
 * rows of several cells each).
 */
export const VIRTUALIZE_THRESHOLD = 150;

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
 *
 * @summary The dense, sortable table every list page uses; collapses to labelled cards on a phone.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowClassName,
  highlightRowKey = null,
  selectedRowKey = null,
  label,
  className = '',
  defaultSort,
  sort: controlledSort,
  onSortChange,
  density = 'default',
  rowContextMenu,
  rowMoreActions = false,
  onRowClick,
  rowClickable,
  expandableRow,
  responsive = 'stack',
  stackColumns = 1,
  stackLayout = 'labelled',
  stacked,
  mobileSort = false,
  stackSummary,
  stackActions,
  groupBy,
  fullWidthRow,
  virtualize = false,
  exportRef,
  exportable,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<DataTableSort | null>(defaultSort ?? null);
  const sort = controlledSort !== undefined ? controlledSort : internalSort;
  function setSort(next: DataTableSort) {
    if (controlledSort === undefined) setInternalSort(next);
    onSortChange?.(next);
  }
  // Only what the reader has toggled; an untouched group falls back to
  // `groupBy.defaultExpanded`, so a group that first appears on a later
  // refresh still gets its intended initial state.
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>({});
  // At most one row open at a time (see `DataTableExpandableRow`) — a single
  // key, not a set.
  const [expandedRowKey, setExpandedRowKey] = useState<string | number | null>(null);
  const isPhone = useIsPhone();
  // Card width: the caller's say where it has one, else the viewport's. The
  // `.dt-stacked` rules (src/styles/index.css) key off the class this sets.
  const cardsWanted = stacked ?? isPhone;
  const isStacked = responsive === 'stack' && cardsWanted;
  const tableRef = useRef<HTMLTableElement>(null);
  const dense = responsive === 'stack' && stackLayout === 'dense';

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
      column.align === 'center' && 'text-center',
      column.headerClassName
    )
  );
  // Which cell titles the card once the rows stack. Marked on every row's
  // cell rather than positionally, so `.dt-stacked` can hoist it out of column
  // order without the markup differing by width.
  const primaryIndex = Math.max(
    0,
    columns.findIndex((column) => column.primary)
  );
  const cardCornerIndex = columns.findIndex((column) => column.cardCorner);
  const cardCornerStart = columns[cardCornerIndex]?.cardCorner === 'start';
  const cardActionsIndex = columns.findIndex((column) => column.cardActions);
  // The dense card's second line: every cell that is neither title, corner
  // nor edge-pinned. The first gets no leading separator. Only computed (and
  // only marked in the DOM) when dense, so no other table's markup changes.
  const firstMetaIndex = dense
    ? columns.findIndex(
        (column, i) =>
          !column.stackEdge && i !== primaryIndex && i !== cardCornerIndex && i !== cardActionsIndex
      )
    : -1;
  // A right-aligned sortable header's own sort glyph (`gap-1` + an icon) sits
  // between the label and the header's right inset, pushing the label ~1rem
  // further left than a plain right-aligned cell below it — same horizontal
  // padding otherwise, on both header and cell. Nudging just these cells'
  // right padding by that same amount brings the numbers back under the
  // label a reader's eye actually lands on, not under the icon.
  const sortIconGutter = density === 'compact' ? 'pr-6' : 'pr-7';
  // A centered column gets no such gutter. Its sortable header is off by only
  // half a glyph (label and icon are centred as one group), and correcting it
  // would misalign a sortable centered column against a non-sortable one
  // beside it — which no gutter can fix, since there is no icon to correct
  // for. Two adjacent columns disagreeing reads worse than 8px.
  // Memoized, not just hoisted: it is a prop of every memoized row, and a
  // fresh array per render would re-render them all.
  const cellClass = useMemo(
    () =>
      columns.map((column) =>
        cx(
          cellPadding,
          column.align === 'right' && 'text-right',
          column.align === 'right' && column.sortValue && sortIconGutter,
          column.align === 'center' && 'text-center',
          column.stickyStart && `${stickyStartClass(column)} ${STICKY_START_CELL}`,
          column.className
        )
      ),
    [columns, cellPadding, sortIconGutter]
  );

  const sortColumn = sort ? columns.find((column) => column.id === sort.columnId) : undefined;
  const activeSortId = sortColumn?.sortValue ? sortColumn.id : undefined;
  // Keyed on the sort's fields and the one `sortValue` in play, not on the
  // `sort` object or the column object: `useUrlSort` re-parses a fresh
  // `sort` whenever the query string changes (every debounced filter write),
  // and a caller rebuilding a column around a memoized `sortValue` shouldn't
  // re-sort either. A column whose `sortValue` isn't stable still re-sorts
  // every render — callers memoize their columns for that.
  const sortDirection = sort?.direction;
  const sortValue = sort
    ? columns.find((column) => column.id === sort.columnId)?.sortValue
    : undefined;
  const sortedRows = useMemo(() => {
    if (!sortDirection || !sortValue) return rows;
    return sortRowsBy(rows, sortValue, sortDirection);
  }, [rows, sortDirection, sortValue]);
  useImperativeHandle(
    exportRef,
    () => ({
      getRows: () => sortedRows,
      sortRows: (all) =>
        sortDirection && sortValue ? sortRowsBy(all, sortValue, sortDirection) : all,
    }),
    [sortedRows, sortDirection, sortValue]
  );
  const tableExport = useMemo<TableExport<T> | null>(
    () =>
      exportable
        ? {
            ...exportable,
            getRows: exportable.getRows ?? (() => sortedRows),
          }
        : null,
    [exportable, sortedRows]
  );

  const grouping = groupBy !== undefined && (cardsWanted || groupBy.allWidths === true);
  // Grouped over (row, index) pairs so `rowKey` still gets each row's index
  // in sort order, exactly as the ungrouped table passes it.
  const groups = useMemo(() => {
    if (!grouping) return null;
    return groupSortedRows(
      sortedRows.map((row, index) => ({ row, index })),
      (entry) => groupBy.key(entry.row)
    );
  }, [grouping, groupBy, sortedRows]);

  const windowed =
    !grouping &&
    (virtualize === true || (virtualize === 'auto' && sortedRows.length > VIRTUALIZE_THRESHOLD));
  const expandable = expandableRow !== undefined;
  // Rough per-layout heights; each mounted row is then measured, so these
  // only have to be close enough to size the rows not yet seen.
  const estimatedRowHeight =
    rootFontScale() *
    (!isStacked
      ? density === 'compact'
        ? 25
        : 29
      : dense
        ? 52
        : 16 + (stackColumns === 2 ? Math.ceil(columns.length / 2) * 36 : columns.length * 20));
  const rowVirtualizerState = useDataTableVirtualizer({
    windowed,
    expandable,
    sortedRows,
    rows,
    rowKey,
    estimatedRowHeight,
    cardsWanted,
    expandedRowKey,
    highlightRowKey,
  });
  const { rowVirtualizer, bodyRef, remeasureRow, expandedIndex, scrollToRowTrigger } =
    rowVirtualizerState;
  useScrollToRowKey(tableRef, highlightRowKey, scrollToRowTrigger);

  function toggleSort(column: DataTableColumn<T>) {
    setSort(nextDataTableSort(sort, column.id));
  }

  // Cells after the caller's columns: the disclosure chevron and the More
  // actions button. Full-width rows span them too.
  const trailingColumns = (expandableRow ? 1 : 0) + (rowMoreActions ? 1 : 0);
  const rowIsClickable = (row: T) =>
    expandable || (Boolean(onRowClick) && (rowClickable ? rowClickable(row) : true));

  // Rows get one stable activator rather than `onRowClick` itself, which
  // callers pass inline — only ever called from a click or key handler, so
  // reading the latest value through a ref can't render anything stale.
  const onRowClickRef = useRef(onRowClick);
  const expandableRef = useRef(expandable);
  useLayoutEffect(() => {
    onRowClickRef.current = onRowClick;
    expandableRef.current = expandable;
  });
  const activateRow = useCallback((row: T, key: string | number) => {
    onRowClickRef.current?.(row);
    if (expandableRef.current) setExpandedRowKey((current) => (current === key ? null : key));
  }, []);

  function renderRow(row: T, index: number, member = false, windowIndex?: number) {
    const key = rowKey(row, index);
    const full = fullWidthRow?.(row);
    if (full !== undefined && full !== null) {
      return (
        <tr
          key={key}
          role="row"
          data-row-key={key}
          className={cx('dt-full-row', member && 'dt-group-member', rowClassName?.(row))}
        >
          <td role="cell" colSpan={columns.length + trailingColumns} className={cellPadding}>
            {full}
          </td>
        </tr>
      );
    }
    const expanded = expandable && expandedRowKey === key;
    return (
      <DataTableRow
        key={key}
        row={row}
        rowKeyValue={key}
        windowIndex={windowIndex}
        ariaRowIndex={
          windowIndex === undefined
            ? undefined
            : windowIndex + (expandedIndex >= 0 && windowIndex > expandedIndex ? 3 : 2)
        }
        member={member}
        columns={columns}
        cellClass={cellClass}
        primaryIndex={primaryIndex}
        cardCornerIndex={cardCornerIndex}
        cardCornerStart={cardCornerStart}
        cardActionsIndex={cardActionsIndex}
        firstMetaIndex={firstMetaIndex}
        dense={dense}
        isStacked={isStacked}
        activeSortId={activeSortId}
        highlighted={highlightRowKey !== null && key === highlightRowKey}
        selected={selectedRowKey !== null && key === selectedRowKey}
        expandable={expandable}
        expanded={expanded}
        hideExpandIcon={(expandableRow?.hideIcon ?? false) || (expandableRow?.leadingIcon ?? false)}
        leadingExpandIcon={expandableRow?.leadingIcon ?? false}
        renderDetail={expanded ? expandableRow?.renderDetail : undefined}
        clickable={rowIsClickable(row)}
        tapOpensRow={Boolean(onRowClick) && (rowClickable ? rowClickable(row) : true)}
        focusable={Boolean(rowContextMenu) || rowIsClickable(row)}
        onActivate={activateRow}
        rowClassName={rowClassName}
        rowContextMenu={rowContextMenu}
        rowMoreActions={rowMoreActions}
        cellPadding={cellPadding}
        compact={density === 'compact'}
        trailingColumns={trailingColumns}
        measureRef={windowIndex === undefined ? undefined : rowVirtualizer.measureElement}
        remeasure={windowIndex === undefined ? undefined : remeasureRow}
      />
    );
  }

  function renderWindow() {
    const items = rowVirtualizer.getVirtualItems();
    const first = items[0];
    const last = items[items.length - 1];
    // `start`/`end` include `scrollMargin`; the total size does not.
    const before = first ? first.start - rowVirtualizer.options.scrollMargin : 0;
    const after = last
      ? rowVirtualizer.getTotalSize() - (last.end - rowVirtualizer.options.scrollMargin)
      : 0;
    const spacer = (height: number, id: string) =>
      height > 0 && (
        <tr key={id} aria-hidden="true" className="dt-spacer" style={{ height }}>
          <td colSpan={columns.length + trailingColumns} className="p-0" />
        </tr>
      );
    // One flat keyed array, the same shape the unwindowed body renders: a
    // table crossing `VIRTUALIZE_THRESHOLD` then keeps its mounted rows (and
    // their focus, an open menu) instead of remounting them under a fragment.
    return [
      spacer(before, 'dt-spacer-before'),
      ...items.map((item) => renderRow(sortedRows[item.index], item.index, false, item.index)),
      spacer(after, 'dt-spacer-after'),
    ];
  }

  const sortableColumns = columns.filter((column) => column.sortValue !== undefined);
  // Hidden by CSS above `sm` when the viewport decides; by JS when the caller does.
  // Only for a table that can stack: in table mode the header sort buttons are on screen.
  const sortBar = mobileSort &&
    sortableColumns.length > 0 &&
    responsive === 'stack' &&
    stacked !== false && (
      <DataTableSortBar
        sortableColumns={sortableColumns}
        sort={sort && activeSortId ? sort : undefined}
        onSortChange={setSort}
        summary={stackSummary}
        actions={stackActions}
        stacked={stacked}
      />
    );

  const table = (
    <table
      ref={tableRef}
      role="table"
      aria-label={label}
      // With most rows unmounted, AT would otherwise count only the window.
      // An open row's detail is a row too.
      aria-rowcount={windowed ? sortedRows.length + 1 + (expandedIndex >= 0 ? 1 : 0) : undefined}
      className={cx(
        'w-full text-xs',
        responsive === 'stack' && 'dt-stack',
        isStacked && 'dt-stacked',
        responsive === 'stack' && !dense && stackColumns === 2 && 'dt-stack-2col',
        dense && 'dt-stack-dense',
        className
      )}
    >
      <DataTableHeader
        columns={columns}
        headerTextClass={headerTextClass}
        sort={sort}
        density={density}
        isStacked={isStacked}
        expandable={expandable}
        rowMoreActions={rowMoreActions}
        onToggleSort={toggleSort}
      />
      <tbody
        ref={bodyRef}
        role="rowgroup"
        // Windowed and expandable, TanStack Virtual already moves the page
        // when a row above the viewport changes size (a far-off open row
        // closing), and the browser's scroll anchoring would move it a second
        // time for the spacer row shrinking with it. Only there: a
        // newest-first ledger relies on anchoring to hold the view steady
        // when a refresh adds rows above it, which TanStack doesn't correct.
        className={cx('divide-y divide-line', windowed && expandable && '[overflow-anchor:none]')}
      >
        {groups
          ? groups.map((group) => {
              const first = group.rows[0];
              if (group.key === null || group.rows.length < (groupBy?.minSize ?? 2) || !first) {
                return group.rows.map((entry) => renderRow(entry.row, entry.index));
              }
              const key = group.key;
              const memberRows = group.rows.map((entry) => entry.row);
              const expanded =
                groupExpanded[key] ?? groupBy?.defaultExpanded?.(memberRows) ?? false;
              return (
                <Fragment key={`dt-group:${key}`}>
                  <DataTableGroupHeader
                    colSpan={columns.length + trailingColumns}
                    expanded={expanded}
                    // Written from the *effective* state, not the stored
                    // one: a default-expanded group has no stored entry,
                    // and negating `undefined` would take two taps.
                    onToggle={() =>
                      setGroupExpanded((previous) => ({ ...previous, [key]: !expanded }))
                    }
                    allWidths={groupBy?.allWidths}
                  >
                    {groupBy?.renderHeader(memberRows)}
                  </DataTableGroupHeader>
                  {expanded && group.rows.map((entry) => renderRow(entry.row, entry.index, true))}
                </Fragment>
              );
            })
          : windowed
            ? renderWindow()
            : sortedRows.map((row, index) => renderRow(row, index))}
      </tbody>
    </table>
  );

  // Exportable: row menus grow the submenu through context; a table with no
  // row menus gets a right-click menu of its own holding just the export
  // formats (the trigger is `asChild`, so still no wrapper element).
  const body = !tableExport ? (
    table
  ) : rowContextMenu ? (
    <TableExportProvider tableExport={tableExport}>{table}</TableExportProvider>
  ) : (
    <ContextMenu>
      <ContextMenuTrigger asChild>{table}</ContextMenuTrigger>
      <ContextMenuContent>
        <ExportTableItems tableExport={tableExport} />
      </ContextMenuContent>
    </ContextMenu>
  );

  // No wrapper element either way, so `className` and every caller's layout
  // (a flex/grid parent sizing the table) see the same `<table>` child.
  return sortBar ? (
    <>
      {sortBar}
      {body}
    </>
  ) : (
    body
  );
}
