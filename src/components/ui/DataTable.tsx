import {
  Fragment,
  useCallback,
  useEffect,
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
import { groupSortedRows, orderGroups } from './dataTableGroup';
import { firstSortDirection, nextDataTableSort, sortRowsBy } from './dataTableSort';
import { DataTableRow } from './DataTableRow';
import { DataTableHeader } from './DataTableHeader';
import { DataTableStickyHeader } from './DataTableStickyHeader';
import { useStickyTableHeader } from './useStickyTableHeader';
import { DataTableGroupHeader } from './DataTableGroupHeader';
import { DataTableSortBar } from './DataTableSortBar';
import { stickyStartClass } from './dataTableSticky';
import {
  columnCellWidth,
  TRAILING_COL_ACTIONS_REM,
  TRAILING_COL_EXPAND_REM,
} from './dataTableWidths';
import { useDataTableVirtualizer } from './useDataTableVirtualizer';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from './ContextMenu';
import { ExportTableItems } from './TableExport';
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

const STICKY_START_CELL = 'max-sm:max-w-30 [tr:hover>&]:bg-panel-2';

export function DataTableDenseCell({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5">{children}</span>;
}

export const VIRTUALIZE_THRESHOLD = 150;

const GROW_COLUMN_MIN = 16;

function fixedLayoutMinWidth<T>(
  columns: readonly DataTableColumn<T>[],
  density: 'default' | 'compact',
  isPhone: boolean,
  trailingRem: number
): string {
  const shown = columns.filter((column) => !(isPhone && column.phoneHidden));
  const sized = shown.flatMap((column) =>
    column.width ? [columnCellWidth(column.width, density)] : []
  );
  const grows = shown.filter((column) => !column.width);
  const floors = grows.map((column) =>
    columnCellWidth(column.minWidth ?? `${GROW_COLUMN_MIN}ch`, density)
  );
  return `calc(${[...sized, ...floors, `${trailingRem}rem`].join(' + ')})`;
}

/** @summary The dense, sortable table every list page uses; collapses to labelled cards on a phone. */
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
  rowHref,
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
  rowBoundary,
  virtualize = false,
  hugColumns = false,
  stickyHeader: stickyHeaderWanted = true,
  exportRef,
  exportable,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<DataTableSort | null>(defaultSort ?? null);
  const sort = controlledSort !== undefined ? controlledSort : internalSort;
  function setSort(next: DataTableSort) {
    if (controlledSort === undefined) setInternalSort(next);
    onSortChange?.(next);
  }
  const [groupExpanded, setGroupExpanded] = useState<Record<string, boolean>>({});
  const [expandedRowKey, setExpandedRowKey] = useState<string | number | null>(
    expandableRow?.initialKey ?? null
  );
  const onExpandedChangeRef = useRef(expandableRow?.onExpandedChange);
  const reportedKey = useRef(expandedRowKey);
  useEffect(() => {
    onExpandedChangeRef.current = expandableRow?.onExpandedChange;
    if (reportedKey.current === expandedRowKey) return;
    reportedKey.current = expandedRowKey;
    onExpandedChangeRef.current?.(expandedRowKey);
  });
  const isPhone = useIsPhone();
  const cardsWanted = stacked ?? isPhone;
  const isStacked = responsive === 'stack' && cardsWanted;
  const tableRef = useRef<HTMLTableElement>(null);
  const dense = responsive === 'stack' && stackLayout === 'dense';
  const stickyHeader = useStickyTableHeader(
    tableRef,
    stickyHeaderWanted && responsive === 'table' && isPhone
  );

  const headerPadding = density === 'compact' ? 'px-2 py-1' : 'px-3 py-2';
  const cellPadding = density === 'compact' ? 'px-2 py-1' : 'px-3 py-1.5';

  const headerTextClass = columns.map((column) =>
    cx(
      headerPadding,
      'font-semibold uppercase',
      column.align === 'right' && 'text-right',
      column.align === 'center' && 'text-center',
      column.headerClassName
    )
  );
  const primaryIndex = Math.max(
    0,
    columns.findIndex((column) => column.primary)
  );
  const cardCornerIndex = columns.findIndex((column) => column.cardCorner);
  const cardCornerStart = columns[cardCornerIndex]?.cardCorner === 'start';
  const cardActionsIndex = columns.findIndex((column) => column.cardActions);
  const firstMetaIndex = dense
    ? columns.findIndex(
        (column, i) =>
          !column.stackEdge && i !== primaryIndex && i !== cardCornerIndex && i !== cardActionsIndex
      )
    : -1;
  const sortIconGutter = density === 'compact' ? 'pr-6' : 'pr-7';
  const cellClass = useMemo(
    () =>
      columns.map((column) =>
        cx(
          cellPadding,
          column.align === 'right' && 'text-right',
          column.align === 'right' && column.sortValue && sortIconGutter,
          column.align === 'center' && 'text-center',
          column.stickyStart && !isStacked && `${stickyStartClass(column)} ${STICKY_START_CELL}`,
          column.className
        )
      ),
    [columns, cellPadding, sortIconGutter, isStacked]
  );

  const sortColumn = sort ? columns.find((column) => column.id === sort.columnId) : undefined;
  const activeSortId = sortColumn?.sortValue ? sortColumn.id : undefined;
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
  const groups = useMemo(() => {
    if (!grouping) return null;
    const gathered = groupSortedRows(
      sortedRows.map((row, index) => ({ row, index })),
      (entry) => groupBy.key(entry.row)
    );
    const { groupCompare } = groupBy;
    return orderGroups(
      gathered,
      groupCompare &&
        ((a, b) =>
          groupCompare(
            a.map((e) => e.row),
            b.map((e) => e.row)
          ))
    );
  }, [grouping, groupBy, sortedRows]);

  const windowed =
    !grouping &&
    (virtualize === true || (virtualize === 'auto' && sortedRows.length > VIRTUALIZE_THRESHOLD));
  const expandable = expandableRow !== undefined;
  const fixedLayout = windowed && !isStacked && columns.some((column) => column.width);
  const sizedLayout =
    fixedLayout || (hugColumns && !isStacked && columns.some((column) => column.width));
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
    setSort(nextDataTableSort(sort, column.id, firstSortDirection(column, rows)));
  }

  const trailingColumns = (expandableRow ? 1 : 0) + (rowMoreActions ? 1 : 0);
  const trailingRem =
    (expandableRow ? TRAILING_COL_EXPAND_REM : 0) + (rowMoreActions ? TRAILING_COL_ACTIONS_REM : 0);
  const buttonToggle = expandableRow?.trigger === 'button';
  const rowIsClickable = (row: T) =>
    (expandable && !buttonToggle) ||
    (Boolean(onRowClick) && (rowClickable ? rowClickable(row) : true));

  const onRowClickRef = useRef(onRowClick);
  const expandableRef = useRef(expandable && !buttonToggle);
  useLayoutEffect(() => {
    onRowClickRef.current = onRowClick;
    expandableRef.current = expandable && !buttonToggle;
  });
  const toggleRow = useCallback((key: string | number) => {
    setExpandedRowKey((current) => (current === key ? null : key));
  }, []);
  const activateRow = useCallback(
    (row: T, key: string | number) => {
      onRowClickRef.current?.(row);
      if (expandableRef.current) toggleRow(key);
    },
    [toggleRow]
  );

  function renderRow(row: T, index: number, member = false, windowIndex?: number) {
    const rendered = renderRecord(row, index, member, windowIndex);
    if (!rowBoundary || rowKey(row, index) !== rowBoundary.beforeKey) return rendered;
    return (
      <Fragment key={`dt-boundary:${rowBoundary.beforeKey}`}>
        <tr role="row" className="dt-full-row dt-boundary bg-panel-2">
          <td role="cell" colSpan={columns.length + trailingColumns} className={cellPadding}>
            {rowBoundary.children}
          </td>
        </tr>
        {rendered}
      </Fragment>
    );
  }

  function renderRecord(row: T, index: number, member = false, windowIndex?: number) {
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
        cardChevron={
          isStacked &&
          (expandableRow?.leadingIcon ?? false) &&
          !(expandableRow?.hideIcon ?? false) &&
          !buttonToggle
        }
        toggleLabel={buttonToggle ? expandableRow?.toggleLabel?.(row) : undefined}
        onToggle={toggleRow}
        renderDetail={expanded ? expandableRow?.renderDetail : undefined}
        clickable={rowIsClickable(row)}
        tapOpensRow={Boolean(onRowClick) && (rowClickable ? rowClickable(row) : true)}
        focusable={Boolean(rowContextMenu) || rowIsClickable(row)}
        onActivate={activateRow}
        rowClassName={rowClassName}
        rowContextMenu={rowContextMenu}
        href={rowHref?.(row)}
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
    return [
      spacer(before, 'dt-spacer-before'),
      ...items.map((item) => renderRow(sortedRows[item.index], item.index, false, item.index)),
      spacer(after, 'dt-spacer-after'),
    ];
  }

  const sortableColumns = columns.filter((column) => column.sortValue !== undefined);
  const sortBar = mobileSort &&
    sortableColumns.length > 0 &&
    responsive === 'stack' &&
    stacked !== false && (
      <DataTableSortBar
        sortableColumns={sortableColumns}
        sort={sort && activeSortId ? sort : undefined}
        onSortChange={setSort}
        rows={rows}
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
      aria-rowcount={windowed ? sortedRows.length + 1 + (expandedIndex >= 0 ? 1 : 0) : undefined}
      style={
        sizedLayout
          ? { minWidth: fixedLayoutMinWidth(columns, density, isPhone, trailingRem) }
          : undefined
      }
      className={cx(
        'w-full text-xs',
        fixedLayout && 'table-fixed',
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
        fixedLayout={sizedLayout}
        expandable={expandable}
        rowMoreActions={rowMoreActions}
        onToggleSort={toggleSort}
      />
      <tbody
        ref={bodyRef}
        role="rowgroup"
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

  const stickyCopy = stickyHeader && (
    <DataTableStickyHeader
      state={stickyHeader}
      columns={columns}
      headerTextClass={headerTextClass}
      sort={sort}
      density={density}
      isStacked={isStacked}
      fixedLayout={sizedLayout}
      expandable={expandable}
      rowMoreActions={rowMoreActions}
      onToggleSort={toggleSort}
    />
  );

  const body =
    !tableExport || rowContextMenu ? (
      table
    ) : (
      <ContextMenu>
        <ContextMenuTrigger asChild>{table}</ContextMenuTrigger>
        <ContextMenuContent>
          <ExportTableItems tableExport={tableExport} />
        </ContextMenuContent>
      </ContextMenu>
    );

  return sortBar || stickyCopy ? (
    <>
      {sortBar}
      {body}
      {stickyCopy}
    </>
  ) : (
    body
  );
}
