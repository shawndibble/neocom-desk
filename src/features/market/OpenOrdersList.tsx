import { Fragment, useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '@/lib/cx';
import { formatIskAuto } from '@/lib/isk';
import { useScrollToRowKey } from '@/lib/useScrollToRowKey';
import { CharacterBadge } from '@/features/character/assetBrowserRows';
import type { OpenOrderRow } from './openOrdersModel';
import { OrderProblemBadge } from './OrderProblemBadge';
import { orderBadgeFor } from './orderBadgeKind';
import { OrderRowSummaryText } from './OrderRowSummaryText';
import { isOffHubStation } from './hubStation';
import { formatOrderFloorPrice, formatOrderRemaining } from './orderRowFormat';

interface OpenOrdersListProps {
  rows: readonly OpenOrderRow[];
  /** Accessible name for the list. */
  label: string;
  /** Whether to tag each row with its owning character (more than one character has orders on screen). */
  showCharacter: boolean;
  /** Whether any visible row carries a floor — matches `DataTable`'s own `hasFloorData` rule so the two never disagree. */
  showFloor: boolean;
  /** The row a notification pointed at (`useHighlightParam`): scrolled to and pulsed. */
  highlightId: number | null;
  onOpen: (row: OpenOrderRow) => void;
  /** Wraps a row, e.g. the item context menu. Same contract as `DataTable`'s. */
  rowContextMenu?: (row: OpenOrderRow, el: ReactElement) => ReactElement;
}

/**
 * Open Orders below `sm`: three lines per order — item/character/price,
 * the problem badge with its sentence, then remaining (and floor, off-hub)
 * — tapping anywhere on the row opens `OrderDetailModal`, the same pattern
 * `OrderHistoryList` and `TransactionsDayList` already ship for their own
 * phone views.
 *
 * The item name renders as plain text, not `MarketItemLink`, and the badge
 * renders with `interactive={false}` (no "?" trigger): both are otherwise
 * focusable content nested inside the row's own `<button>`, which a
 * `<button>` cannot legally contain — `OrderHistoryList`'s docblock gives
 * the same reasoning for dropping its own station tooltip. Location and
 * expiry are dropped entirely here; both already show in the detail modal
 * once the row is open.
 */
export function OpenOrdersList({
  rows,
  label,
  showCharacter,
  showFloor,
  highlightId,
  onOpen,
  rowContextMenu,
}: OpenOrdersListProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLUListElement>(null);
  useScrollToRowKey(listRef, highlightId, rows);

  return (
    <ul ref={listRef} aria-label={label} className="divide-y divide-line">
      {rows.map((row) => {
        const badge = orderBadgeFor(row);
        const offHub = isOffHubStation(row.stationName, row.locationId);
        const listRow = (
          <li data-row-key={row.orderId}>
            <button
              type="button"
              onClick={() => onOpen(row)}
              className={cx(
                'flex min-h-11 w-full flex-col gap-1 px-3 py-2 text-left hover:bg-panel-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
                row.orderId === highlightId && 'row-pulse'
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="flex min-w-0 flex-wrap items-center gap-1">
                  <span className="truncate text-sm text-text">{row.typeName}</span>
                  {showCharacter && <CharacterBadge characterName={row.characterName} t={t} />}
                </span>
                <span className="shrink-0 text-sm font-semibold text-text tabular-nums">
                  {formatIskAuto(row.price)}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5">
                {badge && (
                  <OrderProblemBadge kind={badge.kind} detail={badge.detail} interactive={false} />
                )}
                <OrderRowSummaryText row={row} interactive={false} />
              </span>
              <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-dim tabular-nums">
                <span>
                  {t('orders.remaining')}: {formatOrderRemaining(row.volumeRemain, row.volumeTotal)}
                </span>
                {showFloor && row.floor && (
                  <span>
                    {t('market.orders.floorLabel')}: {formatOrderFloorPrice(row.floor)}
                  </span>
                )}
                {offHub && <span className="text-warning">{t('market.orders.offHub')}</span>}
              </span>
            </button>
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
