import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
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
  rowKeyValue: string | number;
  windowIndex: number | undefined;
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
  isStacked: boolean;
  activeSortId: string | undefined;
  highlighted: boolean;
  selected: boolean;
  expandable: boolean;
  expanded: boolean;
  hideExpandIcon: boolean;
  leadingExpandIcon: boolean;
  cardChevron: boolean;
  toggleLabel: string | undefined;
  onToggle: (key: string | number) => void;
  renderDetail: ((row: T) => ReactNode) | undefined;
  clickable: boolean;
  tapOpensRow: boolean;
  focusable: boolean;
  onActivate: (row: T, key: string | number) => void;
  rowClassName: ((row: T) => string | undefined) | undefined;
  rowContextMenu: ((row: T, tr: ReactElement) => ReactElement) | undefined;
  href: string | undefined;
  rowMoreActions: boolean;
  cellPadding: string;
  compact: boolean;
  trailingColumns: number;
  measureRef: ((node: HTMLTableRowElement | null) => void) | undefined;
  remeasure: ((node: HTMLTableRowElement) => void) | undefined;
}

function isContextMenuKey(event: { key: string; shiftKey: boolean }): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}

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
  cardChevron,
  toggleLabel,
  onToggle,
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
  const [shownExpanded, setShownExpanded] = useState(expanded);
  const [toggled, setToggled] = useState(false);
  if (expanded !== shownExpanded) {
    setShownExpanded(expanded);
    setToggled(true);
  }
  useLayoutEffect(() => {
    const node = rowRef.current;
    if (!remeasure || !node) return;
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
      data-row-key={key}
      data-index={windowIndex}
      aria-rowindex={ariaRowIndex}
      ref={attachRow}
      aria-expanded={expandable && toggleLabel === undefined ? expanded : undefined}
      aria-current={selected ? 'true' : undefined}
      className={cx(
        'hover:bg-panel-2',
        clickable && !selected && 'active:bg-panel',
        interactiveClassName,
        member && 'dt-group-member',
        clickable && 'cursor-pointer',
        focusable &&
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
        highlighted && 'row-pulse',
        selected ? selectedRowClassName : 'border-l-2 border-l-transparent',
        rowClassName?.(row)
      )}
      tabIndex={focusable ? 0 : undefined}
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
              if (event.target !== event.currentTarget) return;
              if (rowContextMenu && isContextMenuKey(event)) {
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
              column.id === activeSortId && 'dt-sorted',
              column.cellClassName?.(row)
            )}
          >
            <RowTappableContext.Provider value={tapOpensRow}>
              {i === 0 && leadingExpandIcon ? (
                <span
                  className={cx(
                    'flex items-center gap-1.5',
                    column.align === 'right' && 'justify-end',
                    column.align === 'center' && 'justify-center'
                  )}
                >
                  {toggleLabel !== undefined ? (
                    <button
                      type="button"
                      aria-label={toggleLabel}
                      aria-expanded={expanded}
                      onClick={() => onToggle(key)}
                      className={cx(
                        interactiveClassName,
                        '-m-1 inline-flex min-h-6 min-w-6 items-center justify-center rounded',
                        column.align === 'right' && 'mr-auto'
                      )}
                    >
                      <Caret expanded={expanded} />
                    </button>
                  ) : (
                    <span
                      className={cx(
                        'dt-lead-caret inline-flex',
                        column.align === 'right' && 'mr-auto'
                      )}
                    >
                      <Caret expanded={expanded} />
                    </span>
                  )}
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
              {(!hideExpandIcon || cardChevron) && (
                <Chevron size={Icon.ICON_SIZE.sm} className="shrink-0 text-text-dim" />
              )}
            </td>
          );
        })()}
      {rowMoreActions && (
        <td role="cell" className={cx(compact ? 'px-1' : 'px-2', 'dt-actions w-0 py-0 text-right')}>
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
            className={cx('bg-panel-2 px-3 py-3', toggled && 'motion-fade')}
          >
            {renderDetail(row)}
          </td>
        </tr>
      )}
    </>
  );
}

export const DataTableRow = memo(DataTableRowImpl) as typeof DataTableRowImpl;
