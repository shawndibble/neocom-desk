import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cx } from '@/lib/cx';
import { interactiveClassName, selectedRowClassName } from './controlStyles';
import { useLiftAfterHoldGuard } from './liftAfterHold';
import { isRowOwnEvent } from './rowEvents';
import * as Icon from './icons';
import { Caret } from './Disclosure';
import { RowMoreActions } from './RowActions';
import { RowOpenHrefContext } from './rowActionsContext';
import { RowTappableContext } from './tooltipHold';
import type { DataTableColumn } from './DataTable';

export interface DataTableRowProps<T> {
  row: T;
  /** `rowKey(row, index)`, computed once by the table. */
  rowKeyValue: string | number;
  /** Position in the whole sorted set when windowed; `undefined` otherwise. */
  windowIndex: number | undefined;
  /**
   * `aria-rowindex` when windowed: past `windowIndex` by the header row, and
   * by one more below an expanded row, whose detail row counts too.
   */
  ariaRowIndex: number | undefined;
  member: boolean;
  columns: readonly DataTableColumn<T>[];
  cellClass: readonly string[];
  primaryIndex: number;
  cardCornerIndex: number;
  cardCornerStart: boolean;
  cardActionsIndex: number;
  firstMetaIndex: number;
  dense: boolean;
  /** Card layout is on: `phoneHidden` columns stay (cards show every cell). */
  isStacked: boolean;
  activeSortId: string | undefined;
  highlighted: boolean;
  selected: boolean;
  expandable: boolean;
  expanded: boolean;
  hideExpandIcon: boolean;
  leadingExpandIcon: boolean;
  /** Only passed to the expanded row, so the caller's inline `expandableRow` object can't re-render the rest. */
  renderDetail: ((row: T) => ReactNode) | undefined;
  clickable: boolean;
  /** A tap on the row runs `onRowClick`; an expand-only row does not count (see `RowTappableContext`). */
  tapOpensRow: boolean;
  focusable: boolean;
  /** Stable (see `DataTable`'s `activateRow`). */
  onActivate: (row: T, key: string | number) => void;
  rowClassName: ((row: T) => string | undefined) | undefined;
  rowContextMenu: ((row: T, tr: ReactElement) => ReactElement) | undefined;
  /** `rowHref(row)`: the page a click goes to, handed to the row menu's "Open in new tab". */
  href: string | undefined;
  rowMoreActions: boolean;
  cellPadding: string;
  compact: boolean;
  trailingColumns: number;
  measureRef: ((node: HTMLTableRowElement | null) => void) | undefined;
  /**
   * Windowed: sizes this (mounted) row again, even mid-scroll — where
   * `measureRef` defers to TanStack, which skips measuring while the page
   * scrolls and would drop a detail that grew then. Stable.
   */
  remeasure: ((node: HTMLTableRowElement) => void) | undefined;
}

/** The ContextMenu key or Shift+F10: the keyboard's right-click. */
function isContextMenuKey(event: { key: string; shiftKey: boolean }): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}

/**
 * One body row (plus its detail row when expanded), memoized so a table-level
 * re-render — a scroll tick of the virtualizer, another row's selection, a
 * menu opening in the page around it — skips every row whose own props are
 * unchanged. That only holds while the caller keeps `columns`, `rowClassName`
 * and `rowContextMenu` referentially stable (`useMemo`/`useCallback`, or a
 * module-level function); an inline one re-renders every row, as before.
 */
function DataTableRowImpl<T>({
  row,
  rowKeyValue: key,
  windowIndex,
  ariaRowIndex,
  member,
  columns,
  cellClass,
  primaryIndex,
  cardCornerIndex,
  cardCornerStart,
  cardActionsIndex,
  firstMetaIndex,
  dense,
  isStacked,
  activeSortId,
  highlighted,
  selected,
  expandable,
  expanded,
  hideExpandIcon,
  leadingExpandIcon,
  renderDetail,
  clickable,
  tapOpensRow,
  focusable,
  onActivate,
  rowClassName,
  rowContextMenu,
  href,
  rowMoreActions,
  cellPadding,
  compact,
  trailingColumns,
  measureRef,
  remeasure,
}: DataTableRowProps<T>) {
  // Windowed, the virtualizer sizes this row as the main row plus its detail
  // row (see `DataTable`'s `measureElement`). Its own observer only watches
  // the main row, so a toggle — or a detail whose content arrives late, an
  // order book loading — is measured again from here.
  const rowRef = useRef<HTMLTableRowElement | null>(null);
  const detailRef = useRef<HTMLTableRowElement | null>(null);
  const attachRow = useCallback(
    (node: HTMLTableRowElement | null) => {
      rowRef.current = node;
      measureRef?.(node);
    },
    [measureRef]
  );
  const measuredExpanded = useRef(expanded);
  useLayoutEffect(() => {
    const node = rowRef.current;
    if (!remeasure || !node) return;
    // Mounting measured already (the ref above); only a toggle needs it.
    if (measuredExpanded.current !== expanded) {
      measuredExpanded.current = expanded;
      remeasure(node);
    }
    const detail = detailRef.current;
    if (!expanded || !detail) return;
    const observer = new ResizeObserver(() => remeasure(node));
    observer.observe(detail);
    return () => observer.disconnect();
  }, [expanded, remeasure]);
  const guard = useLiftAfterHoldGuard();
  const tr = (
    <tr
      role="row"
      // The row's own identity, in the DOM. One static attribute, and
      // the only way a caller can find a specific row to scroll to
      // without this component growing a ref API — `TransactionsPanel`
      // uses it to land on the fill a notification pointed at.
      data-row-key={key}
      data-index={windowIndex}
      // Header row is 1; tells AT where this row sits in the whole set.
      aria-rowindex={ariaRowIndex}
      ref={attachRow}
      aria-expanded={expandable ? expanded : undefined}
      aria-current={selected ? 'true' : undefined}
      className={cx(
        'hover:bg-panel-2',
        // A selected row keeps its `panel-2` fill while pressed.
        clickable && !selected && 'active:bg-panel',
        interactiveClassName,
        member && 'dt-group-member',
        clickable && 'cursor-pointer',
        focusable &&
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        highlighted && 'row-pulse',
        // The 2px edge is on every row (transparent when not selected), so
        // selecting never shifts a cell, in the table or the phone card.
        selected ? selectedRowClassName : 'border-l-2 border-l-transparent',
        rowClassName?.(row)
      )}
      tabIndex={focusable ? 0 : undefined}
      // A touch held for the row menu's long-press lifts into a click on some
      // browsers; that click is the menu's, not the row's (`liftAfterHold.ts`).
      {...(clickable ? guard.handlers : undefined)}
      onClick={
        clickable
          ? (event) => {
              if (guard.swallowClick(event)) return;
              if (isRowOwnEvent(event)) onActivate(row, key);
            }
          : undefined
      }
      onKeyDown={
        clickable || rowContextMenu
          ? (event) => {
              // Only the row's own keys: a focused control inside it (a
              // tooltip trigger, a button, a checkbox) keeps its Enter/Space
              // to itself.
              if (event.target !== event.currentTarget) return;
              if (rowContextMenu && isContextMenuKey(event)) {
                // Row menu trigger listens for `contextmenu`; a keyboard has no pointer, so send
                // one at the row's corner. No menu: event stays unprevented, browser default runs.
                const box = event.currentTarget.getBoundingClientRect();
                const sent = new MouseEvent('contextmenu', {
                  bubbles: true,
                  cancelable: true,
                  clientX: box.left + 8,
                  clientY: box.top + box.height / 2,
                });
                if (!event.currentTarget.dispatchEvent(sent)) event.preventDefault();
                return;
              }
              if (!clickable) return;
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              onActivate(row, key);
            }
          : undefined
      }
    >
      {columns.map((column, i) => {
        const edge = dense ? column.stackEdge : undefined;
        const meta =
          dense && !edge && i !== primaryIndex && i !== cardCornerIndex && i !== cardActionsIndex;
        return (
          <td
            key={column.id}
            role="cell"
            // Printed as the cell's label in the stacked layout. Set
            // unconditionally: it costs one static attribute and keeps
            // the markup width-independent.
            data-label={column.header}
            data-stack-before={column.stackAffix?.before}
            data-stack-after={column.stackAffix?.after}
            className={cx(
              cellClass[i],
              column.phoneHidden && !isStacked && 'max-sm:hidden',
              i === primaryIndex && 'dt-primary',
              i === cardCornerIndex && 'dt-corner',
              i === cardCornerIndex && cardCornerStart && 'dt-corner-start',
              i === cardActionsIndex && 'dt-actions',
              edge && `dt-edge dt-edge-${edge}`,
              meta && 'dt-meta',
              meta && i === firstMetaIndex && 'dt-meta-first',
              // Inert at every width except the dense card, which has no
              // header row to show the sort on and bolds the value instead.
              column.id === activeSortId && 'dt-sorted',
              column.cellClassName?.(row)
            )}
          >
            {/* Only the body cell is "inside a tappable row": the detail row, header,
                footer and group headers sit outside this provider. */}
            <RowTappableContext.Provider value={tapOpensRow}>
              {i === 0 && leadingExpandIcon ? (
                <span
                  className={cx(
                    'flex items-center gap-1.5',
                    column.align === 'right' && 'justify-end',
                    column.align === 'center' && 'justify-center'
                  )}
                >
                  <span
                    className={cx(
                      'dt-lead-caret inline-flex',
                      // A right-aligned first column would otherwise leave the caret
                      // hugging the figure; pin it to the cell's leading edge.
                      column.align === 'right' && 'mr-auto'
                    )}
                  >
                    <Caret expanded={expanded} />
                  </span>
                  {column.render(row)}
                </span>
              ) : (
                column.render(row)
              )}
            </RowTappableContext.Provider>
          </td>
        );
      })}
      {expandable &&
        (() => {
          const Chevron = expanded ? Icon.Expanded : Icon.Descend;
          return (
            <td role="cell" aria-hidden="true" className={cx(cellPadding, 'w-0 dt-disclosure')}>
              {!hideExpandIcon && (
                <Chevron size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-dim" />
              )}
            </td>
          );
        })()}
      {rowMoreActions && (
        <td
          role="cell"
          // No vertical padding: the button is already taller than a line
          // of text, and would otherwise stretch every row it sits in.
          className={cx(compact ? 'px-1' : 'px-2', 'dt-actions w-0 py-0 text-right')}
        >
          <RowMoreActions />
        </td>
      )}
    </tr>
  );
  const mainRow = rowContextMenu ? (
    <RowOpenHrefContext.Provider value={href}>
      {rowContextMenu(row, tr)}
    </RowOpenHrefContext.Provider>
  ) : (
    tr
  );
  if (!expandable) return mainRow;
  return (
    <>
      {mainRow}
      {expanded && renderDetail && (
        <tr
          ref={detailRef}
          role="row"
          className="dt-row-detail"
          aria-rowindex={ariaRowIndex === undefined ? undefined : ariaRowIndex + 1}
        >
          <td
            role="cell"
            colSpan={columns.length + trailingColumns}
            className="bg-panel-2 px-3 py-3"
          >
            {renderDetail(row)}
          </td>
        </tr>
      )}
    </>
  );
}

// The cast keeps the generic: `memo` alone would pin `T` to `unknown`.
export const DataTableRow = memo(DataTableRowImpl) as typeof DataTableRowImpl;
