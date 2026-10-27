import { Fragment, useRef, type ReactElement, type ReactNode } from 'react';
import { RowMoreActions } from '@/components/ui';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { useScrollToRowKey } from '@/lib/useScrollToRowKey';
import type { OpenOrderRow } from './openOrdersModel';
import { OrderProblemBadge } from './OrderProblemBadge';
import { rowFixCall } from './orderDoThis';
import { OrderDoThisText } from './OrderDoThisText';

interface OpenOrdersListProps {
  rows: readonly OpenOrderRow[];
  /** Accessible name for the list. */
  label: string;
  /** The row a notification pointed at (`useHighlightParam`): scrolled to and pulsed. */
  highlightId: number | null;
  /** The selected row (the work-through's current order): accent edge and `aria-current`. */
  selectedId?: number | null;
  /** Content under a row's button, outside it — buttons don't nest (the work-through controls). */
  rowExtra?: (row: OpenOrderRow) => ReactNode;
  onOpen: (row: OpenOrderRow) => void;
  /** Wraps a row, e.g. the item context menu. Same contract as `DataTable`'s. */
  rowContextMenu?: (row: OpenOrderRow, el: ReactElement) => ReactElement;
}

/**
 * The Open Orders fix list below `sm`: a dense two-line card per order — the
 * item and its problem badge, then the "Do this" call with its exact price —
 * and the ⋮ at the right. Tapping anywhere on the card opens
 * `OrderDetailModal`; `rowExtra` sits below, outside the button.
 *
 * The item name is the card's accent cue (§6c), not a `MarketItemLink`, the
 * badge renders with `interactive={false}` (no "?" trigger) and the price is
 * plain text, not a `CopyablePrice`: each would otherwise be focusable content
 * nested inside the card's own `<button>`, which a `<button>` cannot legally
 * contain. Station, character, remaining and expiry live in the detail.
 */
export function OpenOrdersList({
  rows,
  label,
  highlightId,
  selectedId = null,
  rowExtra,
  onOpen,
  rowContextMenu,
}: OpenOrdersListProps) {
  const listRef = useRef<HTMLUListElement>(null);
  useScrollToRowKey(listRef, highlightId, rows);

  return (
    <ul ref={listRef} aria-label={label} className="divide-y divide-line">
      {rows.map((row) => {
        const { badge } = rowFixCall(row).advice;
        const listRow = (
          <li
            data-row-key={row.orderId}
            aria-current={row.orderId === selectedId ? 'true' : undefined}
            className={cx(
              'flex flex-col',
              row.orderId === selectedId ? selectedRowClassName : 'border-l-2 border-l-transparent'
            )}
          >
            <div className="flex items-start">
              <button
                type="button"
                onClick={() => onOpen(row)}
                className={cx(
                  'flex min-h-9 min-w-0 flex-1 flex-col gap-1 px-3 py-2 text-left',
                  rowInteractiveClassName,
                  focusRingInsetClassName,
                  row.orderId === highlightId && 'row-pulse'
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-medium text-accent">
                    {row.typeName}
                  </span>
                  {badge && (
                    <OrderProblemBadge
                      kind={badge.kind}
                      detail={badge.detail}
                      interactive={false}
                      className="shrink-0"
                    />
                  )}
                </span>
                <span className="text-xs font-semibold text-text">
                  <OrderDoThisText row={row} interactive={false} />
                </span>
              </button>
              {/* Beside the button, not in it — buttons don't nest. */}
              <RowMoreActions className="mr-1 shrink-0 self-center" />
            </div>
            {rowExtra?.(row)}
          </li>
        );
        return (
          <Fragment key={row.orderId}>
            {rowContextMenu ? rowContextMenu(row, listRow) : listRow}
          </Fragment>
        );
      })}
    </ul>
  );
}
