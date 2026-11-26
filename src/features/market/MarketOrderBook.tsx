import { fixedFormat, fixed1 } from '@/lib/fixedFormat';
import { useMemo, useState } from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  StatChip,
  StatChips,
  type DataTableColumn,
  type DataTableSort,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { sortRows } from '@/components/ui/dataTableSort';
import type { UseTableExport } from '@/components/ui/useTableExport';
import { priceComparison } from '@/engine/market/orderBookDepth';
import type { OrderBookSummary } from '@/engine/market/orderBook';
import type { RegionOrder } from '@/esi/endpoints';
import { cx } from '@/lib/cx';
import {
  focusRingInsetClassName,
  interactiveClassName,
  toggleChipStateClassName,
} from '@/components/ui/controlStyles';
import { formatIskCompact, formatMarketIsk } from '@/lib/isk';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { formatVolume } from './format';
import {
  ORDER_HEADING_FIGURE_IDS,
  useOrderHeadingFigures,
  type MarketOrderColumnId,
  type OrderHeadingFigureId,
} from './marketOrderColumns';
import { PlaceJumpsLink } from '@/features/route/JumpsLink';
import { TurnInDetail, TurnInFigureButton } from '@/features/campaigns/TurnInDetail';
import { approxIsk } from '@/features/campaigns/turnInContent';
import { useTurnInOffers } from '@/features/campaigns/useTurnIns';
import type { TradeHub } from '@/market/hubs';
import { formatCount } from '@/lib/formatCount';

export type BookSide = 'sell' | 'buy';

const SEPARATOR = ' · ';

function signedPercent(ratio: number): string {
  if (ratio >= 9) return `${formatCount(1 + ratio)}×`;
  const share = Math.abs(ratio);
  const digits = share >= 0.1 ? 0 : share >= 0.01 ? 1 : 2;
  const text = `${fixedFormat(digits)(Math.abs(ratio * 100))}%`;
  return ratio > 0 ? `+${text}` : ratio < 0 ? `−${text}` : text;
}

export function OrderBookSummaryStrip({
  bestSell,
  bestBuy,
  item,
  hub,
}: {
  bestSell: number | null;
  bestBuy: number | null;
  item: { typeId: number; name: string } | null;
  hub: TradeHub;
}) {
  const { t } = useTranslation();
  const spread = priceComparison(bestBuy, bestSell);
  const turnIns = useTurnInOffers(hub);
  const offer = item === null ? null : (turnIns.data?.offerFor(item.typeId) ?? null);
  const phoneHidden = 'max-sm:hidden';
  return (
    <StatChips className={offer ? undefined : phoneHidden}>
      <StatChip
        className={phoneHidden}
        label={t('market.summary.bestSell')}
        value={bestSell === null ? '—' : formatMarketIsk(bestSell)}
      />
      <StatChip
        className={phoneHidden}
        label={t('market.summary.bestBuy')}
        value={bestBuy === null ? '—' : formatMarketIsk(bestBuy)}
      />
      <StatChip
        className={phoneHidden}
        label={t('market.summary.spread')}
        tooltip={t('market.summary.spreadHint')}
        value={
          spread === null
            ? '—'
            : `${formatMarketIsk(spread.delta)} (${fixed1(spread.ratio * 100)}%)`
        }
      />
      {offer && item && (
        <StatChip
          label={t('market.summary.turnIn')}
          value={
            <TurnInDetail
              name={item.name}
              offer={offer}
              trigger={
                <TurnInFigureButton name={item.name}>
                  {approxIsk(offer.totalPerItem)}
                </TurnInFigureButton>
              }
            />
          }
        />
      )}
    </StatChips>
  );
}

export interface HubComparisonLineProps {
  placeName: string;
  summary: OrderBookSummary | undefined;
  inRangeBestSell: number | null;
  inRangeBestBuy: number | null;
  jumps: number | null;
  stationId: number | null;
  onView: () => void;
}

export function HubComparisonLine({
  placeName,
  summary,
  inRangeBestSell,
  inRangeBestBuy,
  jumps,
  stationId,
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
      className="flex items-center justify-between gap-x-3 border border-line bg-panel px-3 py-2 text-xs"
    >
      <dl className="m-0 grid min-w-0 grid-cols-[auto_auto] items-baseline gap-x-2 gap-y-1">
        {summary.bestSell !== null && (
          <>
            <dt className="whitespace-nowrap text-right font-semibold tabular-nums">
              {t('market.hubCompare.sells', {
                place: placeName,
                price: formatMarketIsk(summary.bestSell),
              })}
            </dt>
            <dd className="m-0 whitespace-nowrap tabular-nums">
              {sell && sell.delta !== 0 && (
                <span className={sell.delta < 0 ? 'text-isk-pos' : 'text-isk-neg'}>
                  {signedPercent(sell.ratio)}
                </span>
              )}
            </dd>
          </>
        )}
        {summary.bestBuy !== null && (
          <>
            <dt className="whitespace-nowrap text-right font-semibold tabular-nums">
              {t('market.hubCompare.buys', { price: formatMarketIsk(summary.bestBuy) })}
            </dt>
            <dd className="m-0 whitespace-nowrap tabular-nums">
              {buy && buy.delta !== 0 && (
                <span className={buy.delta > 0 ? 'text-isk-pos' : 'text-isk-neg'}>
                  {signedPercent(buy.ratio)}
                </span>
              )}
            </dd>
          </>
        )}
      </dl>
      {jumps !== null && (
        <span className="whitespace-nowrap text-text-dim">
          {stationId === null ? (
            t('market.hubCompare.jumps', { count: jumps })
          ) : (
            <PlaceJumpsLink locationId={stationId}>
              {t('market.hubCompare.jumps', { count: jumps })}
            </PlaceJumpsLink>
          )}
        </span>
      )}
      <Button size="sm" className="shrink-0" onClick={onView}>
        {t('market.hubCompare.view', { place: placeName })}
      </Button>
    </section>
  );
}

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
              'flex min-h-9 flex-1 flex-col items-start justify-center border border-b-2 px-3 py-1.5 text-left',
              interactiveClassName,
              focusRingInsetClassName,
              toggleChipStateClassName(pressed),
              pressed && (segment.id === 'sell' ? 'border-b-isk-neg' : 'border-b-isk-pos')
            )}
          >
            <span className="text-[0.6875rem] font-semibold tracking-widest uppercase">
              {t(`market.sideToggle.${segment.id}`, { count: segment.count })}
            </span>
            <span className={cx('text-sm tabular-nums', pressed ? 'font-semibold' : 'font-normal')}>
              {segment.best === null ? '—' : formatMarketIsk(segment.best)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export interface OrderSideCardProps {
  side: BookSide;
  rows: readonly RegionOrder[];
  rowCap?: number;
  total: number;
  hiddenBaitCount?: number;
  best: number | null;
  columns: readonly DataTableColumn<RegionOrder>[];
  availableColumns: readonly MarketOrderColumnId[];
  visibleColumns: readonly MarketOrderColumnId[];
  columnsById: Record<MarketOrderColumnId, DataTableColumn<RegionOrder>>;
  onToggleColumn: (id: MarketOrderColumnId) => void;
  tableExport: UseTableExport<RegionOrder>;
  empty: ReactNode;
  onShowAll: (() => void) | null;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  renderDetail: (order: RegionOrder) => ReactNode;
  rowContextMenu: (order: RegionOrder, tr: ReactElement) => ReactElement;
  rowClassName: (order: RegionOrder) => string | undefined;
  hiddenOnPhone: boolean;
  cards: boolean;
}

export function OrderSideCard({
  side,
  rows,
  rowCap,
  total,
  hiddenBaitCount = 0,
  best,
  columns,
  availableColumns,
  visibleColumns,
  columnsById,
  onToggleColumn,
  tableExport,
  empty,
  onShowAll,
  headingRef,
  renderDetail,
  rowContextMenu,
  rowClassName,
  hiddenOnPhone,
  cards,
}: OrderSideCardProps) {
  const { t } = useTranslation();
  const name = t(side === 'sell' ? 'market.sell' : 'market.buy');
  const [sort, setSort] = useState<DataTableSort>({
    columnId: 'price',
    direction: side === 'sell' ? 'asc' : 'desc',
  });
  const headingFigures = useOrderHeadingFigures((state) => state.value);
  const setHeadingFigures = useOrderHeadingFigures((state) => state.setValue);
  useHydratedStore(useOrderHeadingFigures);
  const { units, value } = useMemo(() => {
    let u = 0;
    let v = 0;
    for (const o of rows) {
      u += o.volume_remain;
      v += o.volume_remain * o.price;
    }
    return { units: u, value: v };
  }, [rows]);
  const figureTexts = ORDER_HEADING_FIGURE_IDS.filter((id) => headingFigures.includes(id)).map(
    (id) => ({
      id,
      text:
        id === 'units'
          ? t('market.sideSummary.units', { count: units, formatted: formatVolume(units) })
          : t('market.sideSummary.value', { amount: formatIskCompact(value) }),
    })
  );
  const toggleHeadingFigure = (id: OrderHeadingFigureId) =>
    void setHeadingFigures(
      headingFigures.includes(id)
        ? headingFigures.filter((existing) => existing !== id)
        : [...headingFigures, id]
    );
  const shownRows = useMemo(() => {
    const column = columns.find((c) => c.id === sort.columnId);
    const sorted = column ? sortRows(rows, column, sort.direction) : rows;
    return rowCap === undefined ? sorted : sorted.slice(0, rowCap);
  }, [rows, rowCap, columns, sort]);
  return (
    <section
      aria-label={name}
      className={cx(
        'border border-t-2 border-line bg-panel',
        side === 'sell' ? 'border-t-isk-neg' : 'border-t-isk-pos',
        hiddenOnPhone && 'max-sm:hidden'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2 pb-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <h2
            ref={headingRef}
            className="m-0 text-xs font-semibold tracking-widest uppercase focus:outline-none"
          >
            {name}
          </h2>
          <span className="text-xs text-text-dim tabular-nums">
            <span className="max-sm:hidden">
              {t('market.sideSummary.orders', { count: total })}
            </span>
            {figureTexts.map(({ id, text }, i) => (
              <span key={id}>
                <span className={i === 0 ? 'max-sm:hidden' : undefined}>{SEPARATOR}</span>
                {text}
              </span>
            ))}
            {best !== null && (
              <span className="max-sm:hidden">
                {SEPARATOR}
                {t(side === 'sell' ? 'market.sideSummary.lowest' : 'market.sideSummary.highest', {
                  price: formatMarketIsk(best),
                })}
              </span>
            )}
          </span>
          {hiddenBaitCount > 0 && (
            <span className="text-xs text-text-dim tabular-nums">
              {t('market.sideSummary.baitHidden', { count: hiddenBaitCount })}
            </span>
          )}
        </div>
        <span className="flex items-center gap-1">
          <ColumnPickerMenu
            available={availableColumns}
            visible={visibleColumns}
            columnsById={columnsById}
            onToggle={onToggleColumn}
            buttonLabel={t('market.columnsButton')}
            menuTitle={t('market.columnsMenuTitle')}
            size="sm"
            extraItems={ORDER_HEADING_FIGURE_IDS.map((id) => ({
              id,
              label: t(`market.headingFigure.${id}`),
              checked: headingFigures.includes(id),
              onToggle: () => toggleHeadingFigure(id),
            }))}
          />
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
              rows={shownRows}
              sort={sort}
              onSortChange={setSort}
              virtualize="auto"
              rowKey={(o) => o.order_id}
              label={name}
              stackLayout="dense"
              stacked={cards}
              className="dt-actions-pinned-only"
              rowContextMenu={rowContextMenu}
              rowMoreActions
              rowClassName={rowClassName}
              expandableRow={{ renderDetail, leadingIcon: true }}
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
