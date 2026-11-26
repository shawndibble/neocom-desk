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
import { TurnInGlyph } from '@/features/campaigns/TurnInDetail';
import { orderTurnInGlyph } from './orderTurnIn';

interface OpenOrdersListProps {
  rows: readonly OpenOrderRow[];
  label: string;
  highlightId: number | null;
  selectedId?: number | null;
  rowExtra?: (row: OpenOrderRow) => ReactNode;
  onOpen: (row: OpenOrderRow) => void;
  rowContextMenu?: (row: OpenOrderRow, el: ReactElement) => ReactElement;
}

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
              {orderTurnInGlyph(row) && (
                <TurnInGlyph
                  name={row.typeName}
                  onClick={() => onOpen(row)}
                  className="min-h-9 min-w-9 justify-center self-center"
                />
              )}
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
