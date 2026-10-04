/**
 * The Market Browser's Order Book body, under the scope bar: a summary strip
 * (best sell, best buy, spread), the hub comparison a Jump Range earns, and
 * the Sell and Buy cards — each its own card with its count and best price
 * in the heading, stacked Sell over Buy at every width and in every Location
 * Mode, so setting a range never moves anything. A phone shows one side at a
 * time behind a Sell | Buy toggle; the other card is only hidden by CSS, so a
 * width change never re-mounts a table.
 */
import type { ReactElement, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import type { UseTableExport } from '@/components/ui/useTableExport';
import { priceComparison } from '@/engine/market/orderBookDepth';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import type { RegionOrder } from '@/esi/endpoints';
import { cx } from '@/lib/cx';
import { toggleChipStateClassName } from '@/components/ui/controlStyles';
import { formatIsk } from '@/lib/isk';
import type { MarketOrderColumnId } from './marketOrderColumns';
import { SetDestinationButton } from './SetDestinationButton';

export type BookSide = 'sell' | 'buy';

/**
 * "−35%" / "+4.2%": a signed share, the sign never left to colour alone. Past
 * ten times over (a 2,600 buy in range against a 325,800 one at the hub) a
 * percentage stops reading as a number, so it says "125×" instead.
 */
function signedPercent(ratio: number): string {
  if (ratio >= 9) return `${Math.round(1 + ratio).toLocaleString()}×`;
  const share = Math.abs(ratio);
  const digits = share >= 0.1 ? 0 : share >= 0.01 ? 1 : 2;
  const text = `${Math.abs(ratio * 100).toFixed(digits)}%`;
  return ratio > 0 ? `+${text}` : ratio < 0 ? `−${text}` : text;
}

export function OrderBookSummaryStrip({
  bestSell,
  bestBuy,
}: {
  bestSell: number | null;
  bestBuy: number | null;
}) {
  const { t } = useTranslation();
  const spread = priceComparison(bestBuy, bestSell);
  return (
    // The phone's Sell | Buy toggle already carries both best prices.
    <StatChips className="max-sm:hidden">
      <StatChip
        label={t('market.summary.bestSell')}
        value={bestSell === null ? '—' : formatIsk(bestSell, 2)}
      />
      <StatChip
        label={t('market.summary.bestBuy')}
        value={bestBuy === null ? '—' : formatIsk(bestBuy, 2)}
      />
      <StatChip
        label={t('market.summary.spread')}
        tooltip={t('market.summary.spreadHint')}
        value={
          spread === null
            ? '—'
            : `${formatIsk(spread.delta, 2)} (${(spread.ratio * 100).toFixed(1)}%)`
        }
      />
    </StatChips>
  );
}

export interface HubComparisonLineProps {
  /** The header's hub system, or the picked region's name. */
  placeName: string;
  /** The header scope's book for this item; `undefined` while it loads. */
  summary: OrderBookSummary | undefined;
  inRangeBestSell: number | null;
  inRangeBestBuy: number | null;
  /** Jumps from the Current System to the hub; `null` for a region, or unknown. */
  jumps: number | null;
  /** The hub station, for Set destination; `null` in Region mode. */
  stationId: number | null;
  stationName: string | null;
  /** Clears the Jump Range, so the book reads the header's scope again. */
  onView: () => void;
}

/**
 * "Is the trip to the hub worth it?" — shown only while a Jump Range has
 * replaced the header's hub or region: that scope's best prices against the
 * best in range, signed, with the distance.
 */
export function HubComparisonLine({
  placeName,
  summary,
  inRangeBestSell,
  inRangeBestBuy,
  jumps,
  stationId,
  stationName,
  onView,
}: HubComparisonLineProps) {
  const { t } = useTranslation();
  if (summary === undefined) return null;
  const sell = priceComparison(inRangeBestSell, summary.bestSell);
  const buy = priceComparison(inRangeBestBuy, summary.bestBuy);
  if (summary.bestSell === null && summary.bestBuy === null) return null;

  return (
    <section
      aria-label={t('market.hubCompare.label', { place: placeName })}
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border border-line bg-panel px-3 py-2 text-xs max-sm:flex-col max-sm:items-start"
    >
      <p className="m-0 flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
        {summary.bestSell !== null && (
          <span className="whitespace-nowrap">
            <span className="font-semibold">
              {t('market.hubCompare.sells', {
                place: placeName,
                price: formatIsk(summary.bestSell, 2),
              })}
            </span>
            {sell && sell.delta !== 0 && (
              // Cheaper at the hub is the good news for a buyer.
              <span className={cx('ml-1', sell.delta < 0 ? 'text-isk-pos' : 'text-isk-neg')}>
                {signedPercent(sell.ratio)}
              </span>
            )}
          </span>
        )}
        {summary.bestBuy !== null && (
          <span className="whitespace-nowrap">
            <span className="font-semibold">
              {t('market.hubCompare.buys', { price: formatIsk(summary.bestBuy, 2) })}
            </span>
            {buy && buy.delta !== 0 && (
              // A higher buy at the hub is the good news for a seller.
              <span className={cx('ml-1', buy.delta > 0 ? 'text-isk-pos' : 'text-isk-neg')}>
                {signedPercent(buy.ratio)}
              </span>
            )}
          </span>
        )}
        {jumps !== null && (
          <span className="text-text-dim">{t('market.hubCompare.jumps', { count: jumps })}</span>
        )}
      </p>
      <span className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onView}>
          {t('market.hubCompare.view', { place: placeName })}
        </Button>
        {stationId !== null && (
          <SetDestinationButton locationId={stationId} placeName={stationName ?? placeName} />
        )}
      </span>
    </section>
  );
}

/**
 * A phone's Sell | Buy switch: one side at a time, each segment carrying its
 * count and best price so the hidden side is never a blind guess. Built by
 * hand rather than as a `SegmentedControl` because each segment is two lines
 * (label and price); the on/off tint is still the shared toggle-chip one, with
 * the side's own colour only on its bottom edge.
 */
export function BookSideToggle({
  side,
  onChange,
  sellCount,
  buyCount,
  bestSell,
  bestBuy,
}: {
  side: BookSide;
  onChange: (next: BookSide) => void;
  sellCount: number;
  buyCount: number;
  bestSell: number | null;
  bestBuy: number | null;
}) {
  const { t } = useTranslation();
  const segments: { id: BookSide; count: number; best: number | null }[] = [
    { id: 'sell', count: sellCount, best: bestSell },
    { id: 'buy', count: buyCount, best: bestBuy },
  ];
  return (
    <div role="group" aria-label={t('market.sideToggle.label')} className="flex sm:hidden">
      {segments.map((segment) => {
        const pressed = segment.id === side;
        return (
          <button
            key={segment.id}
            type="button"
            aria-pressed={pressed}
            onClick={() => onChange(segment.id)}
            className={cx(
              'flex min-h-11 flex-1 flex-col items-start justify-center border border-b-2 px-3 py-1.5 text-left',
              toggleChipStateClassName(pressed),
              pressed && (segment.id === 'sell' ? 'border-b-isk-neg' : 'border-b-isk-pos')
            )}
          >
            <span className="text-[0.6875rem] font-semibold tracking-widest uppercase">
              {t(`market.sideToggle.${segment.id}`, { count: segment.count })}
            </span>
            <span className={cx('text-sm tabular-nums', pressed ? 'font-semibold' : 'font-normal')}>
              {segment.best === null ? '—' : formatIsk(segment.best, 2)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface OrderSideCardProps {
  side: BookSide;
  /** Rows on screen: the side's best-first list, capped until "Show all". */
  rows: readonly RegionOrder[];
  /** Every order on this side, for the heading and "Show all". */
  total: number;
  best: number | null;
  columns: readonly DataTableColumn<RegionOrder>[];
  availableColumns: readonly MarketOrderColumnId[];
  visibleColumns: readonly MarketOrderColumnId[];
  columnsById: Record<MarketOrderColumnId, DataTableColumn<RegionOrder>>;
  onToggleColumn: (id: MarketOrderColumnId) => void;
  tableExport: UseTableExport<RegionOrder>;
  /** Shown in place of the table when the side has no orders. */
  empty: ReactNode;
  /** Whether a "Show all" button is due, and what it does. */
  onShowAll: (() => void) | null;
  renderDetail: (order: RegionOrder) => ReactNode;
  rowContextMenu: (order: RegionOrder, tr: ReactElement) => ReactElement;
  rowClassName: (order: RegionOrder) => string | undefined;
  /** The phone toggle hides the side it isn't showing. */
  hiddenOnPhone: boolean;
  /** Two-line cards instead of columns: a phone, or a column too narrow for them. */
  cards: boolean;
}

export function OrderSideCard({
  side,
  rows,
  total,
  best,
  columns,
  availableColumns,
  visibleColumns,
  columnsById,
  onToggleColumn,
  tableExport,
  empty,
  onShowAll,
  renderDetail,
  rowContextMenu,
  rowClassName,
  hiddenOnPhone,
  cards,
}: OrderSideCardProps) {
  const { t } = useTranslation();
  const name = t(side === 'sell' ? 'market.sell' : 'market.buy');
  return (
    <section
      aria-label={name}
      className={cx(
        'border border-t-2 border-line bg-panel',
        side === 'sell' ? 'border-t-isk-neg' : 'border-t-isk-pos',
        hiddenOnPhone && 'max-sm:hidden'
      )}
    >
      {/* Each export sits with the table it exports, beside its own heading. */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2 pb-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h2 className="m-0 text-xs font-semibold tracking-widest uppercase">{name}</h2>
          <span className="text-xs text-text-dim tabular-nums max-sm:hidden">
            {best === null
              ? t('market.sideSummary.none', { count: total })
              : t(side === 'sell' ? 'market.sideSummary.sell' : 'market.sideSummary.buy', {
                  count: total,
                  price: formatIsk(best, 2),
                })}
          </span>
        </div>
        <span className="flex items-center gap-1">
          {/* A two-line card has no columns to pick. */}
          {!cards && (
            <ColumnPickerMenu
              available={availableColumns}
              visible={visibleColumns}
              columnsById={columnsById}
              onToggle={onToggleColumn}
              buttonLabel={t('market.columnsButton')}
              menuTitle={t('market.columnsMenuTitle')}
              size="sm"
            />
          )}
          <TableActionsMenu name={name} tableExport={tableExport} />
        </span>
      </div>
      {total === 0 ? (
        empty
      ) : (
        <>
          <div className="overflow-x-auto">
            <DataTable
              {...tableExport.tableProps}
              columns={columns}
              rows={rows}
              virtualize="auto"
              rowKey={(o) => o.order_id}
              label={name}
              defaultSort={{ columnId: 'price', direction: side === 'sell' ? 'asc' : 'desc' }}
              // Two lines per order on a phone — station and price, then
              // quantity, distance and security — a long book is scanned,
              // not read.
              stackLayout="dense"
              stacked={cards}
              rowContextMenu={rowContextMenu}
              rowClassName={rowClassName}
              expandableRow={{ renderDetail }}
            />
          </div>
          {onShowAll && (
            <div className="px-3 py-2">
              <Button size="sm" onClick={onShowAll}>
                {t('market.showAll', { count: total })}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
