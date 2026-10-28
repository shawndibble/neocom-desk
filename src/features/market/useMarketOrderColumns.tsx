/**
 * The order book's Sell/Buy table columns: the fixed set both tables can
 * show (`MARKET_ORDER_COLUMN_IDS`), which of them are actually visible (a
 * device-local preference, `marketOrderColumns.ts`), and per-column render.
 */
import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { DataTableColumn } from '@/components/ui';
import { COL_DATE, COL_ISK, COL_QUANTITY, COL_SMALL_NUMBER } from '@/components/ui/dataTableWidths';
import {
  SELL_ORDER_COLUMN_IDS,
  BUY_ORDER_COLUMN_IDS,
  useVisibleMarketOrderColumns,
  ORDER_BOOK_LOCATION_CLASS,
  isColumnWithheld,
  type MarketOrderColumnId,
} from '@/features/market/marketOrderColumns';
import { formatVolume } from '@/features/market/format';
import { feeColumnTooltip } from '@/features/market/feeColumnTooltip';
import {
  resolveOrderLocation,
  orderExpiry,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import {
  BaitFlag,
  LocationCell,
  MyOrderMark,
  SecurityCell,
} from '@/features/market/marketOrderCells';
import { renderJumpsCell } from '@/features/route/jumpsCell';
import type { JumpRangeFilter, JumpsCellValue } from '@/features/route/currentSystem';
import type { RegionOrder } from '@/esi/endpoints';
import { orderFees, type OrderFeeContext } from '@/engine/market/orderFees';
import { formatMarketIsk } from '@/lib/isk';
import { rangeLabel } from '@/features/market/orderBookCsv';
import { sellOutlierMultiple } from '@/engine/market/orderBookDepth';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';

/**
 * Ordinal rank for an order's `range`: station, then solarsystem, then a
 * jump count (ranked by the number itself), then region last of all —
 * alphabetical order would put "region" before "station". `undefined` for a
 * value this app doesn't recognise, so it sinks like any other unknown.
 */
function rangeRank(range: string): number | undefined {
  if (range === 'station') return 0;
  if (range === 'solarsystem') return 1;
  if (range === 'region') return Number.MAX_SAFE_INTEGER;
  const jumps = Number(range);
  return Number.isFinite(jumps) ? 2 + jumps : undefined;
}

export interface UseMarketOrderColumnsArgs {
  t: TFunction;
  npcStationMap: ReadonlyMap<number, NpcStationLookup>;
  solarSystemMap: ReadonlyMap<number, SolarSystemLookup>;
  myOrderIds: ReadonlySet<number>;
  jumpRangeFilter: JumpRangeFilter;
  /** The book's best sell, which a bait-priced sell order is measured against. */
  bestSell: number | null;
  /**
   * Whether the tables show as two-line cards — on a phone, or wherever the
   * order book's column is too narrow for its columns. Chosen in JS from the
   * book's own width, so card-only touches can't follow the viewport (ADR 0017).
   */
  cards: boolean;
  /** The book is short of room for Location's full cap: `ORDER_BOOK_LOCATION_REM.squeezed`. */
  locationSqueezed: boolean;
  /**
   * The book covers exactly one station, which the scope bar already names:
   * Location is left off the tables and cards. The stored picks are untouched.
   */
  hideLocation: boolean;
  /** What the fee columns price with; null until the active Character's skills are known, which also keeps the columns out. */
  feeContext: OrderFeeContext | null;
}

export interface MarketOrderColumns {
  visibleOrderColumns: readonly MarketOrderColumnId[];
  toggleOrderColumn: (id: MarketOrderColumnId) => void;
  orderColumnsById: Record<MarketOrderColumnId, DataTableColumn<RegionOrder>>;
  baseColumns: DataTableColumn<RegionOrder>[];
  buyColumns: DataTableColumn<RegionOrder>[];
  sellHiddenColumns: readonly MarketOrderColumnId[];
  buyHiddenColumns: readonly MarketOrderColumnId[];
}

export function useMarketOrderColumns({
  t,
  npcStationMap,
  solarSystemMap,
  myOrderIds,
  jumpRangeFilter,
  bestSell,
  cards,
  locationSqueezed,
  hideLocation,
  feeContext,
}: UseMarketOrderColumnsArgs): MarketOrderColumns {
  const timeZone = useTimeZone();
  const pickedOrderColumns = useVisibleMarketOrderColumns((state) => state.value);
  const visibleOrderColumns = useMemo(
    () => pickedOrderColumns.filter((id) => !isColumnWithheld(id, { hideLocation, feeContext })),
    [hideLocation, feeContext, pickedOrderColumns]
  );
  const setVisibleOrderColumns = useVisibleMarketOrderColumns((state) => state.setValue);
  useHydratedStore(useVisibleMarketOrderColumns);
  function toggleOrderColumn(id: MarketOrderColumnId) {
    const next = pickedOrderColumns.includes(id)
      ? pickedOrderColumns.filter((existing) => existing !== id)
      : [...pickedOrderColumns, id];
    void setVisibleOrderColumns(next);
  }

  /**
   * A row's own distance from the Current System — independent of whether a
   * Jump Range filter is even active (`jumpRangeFilter.jumps`/`jumpsStatus`
   * are populated at every range, `useJumpRangeFilter`). `count: null` is a
   * settled row this app cannot place on the stargate graph — not the same
   * as still loading, same "unknowable, not pending" rule the Courier
   * board's own Jumps column follows.
   */
  const orderJumps = useCallback(
    (systemId: number): JumpsCellValue => {
      if (jumpRangeFilter.jumpsStatus !== 'ready') return { kind: jumpRangeFilter.jumpsStatus };
      return { kind: 'value', count: jumpRangeFilter.jumps?.get(systemId) ?? null };
    },
    [jumpRangeFilter]
  );

  const orderColumnsById = useMemo<Record<MarketOrderColumnId, DataTableColumn<RegionOrder>>>(
    () => ({
      price: {
        id: 'price',
        header: t('market.price'),
        // The figure plus the my-order and bait marks left of it.
        width: '24ch',
        align: 'right',
        className: 'tabular-nums',
        // The phone card's headline figure: a book is scanned by price.
        // With Location unticked, Price is the card's title instead
        // (DataTable falls back to the first column), not both at once.
        cardCorner: visibleOrderColumns.includes('location'),
        render: (o) => (
          <>
            {/*
              Left of the figure, so the prices stay right-aligned in one
              column. Mine, then bait, then the price, all on one line: the row tint
              (`row-mine`, styles/index.css) is not enough alone (colour is
              never the sole signal, docs/DESIGN.md §7), and a second line
              would break the column of a book scanned by price.
            */}
            {myOrderIds.has(o.order_id) && <MyOrderMark t={t} />}
            {!o.is_buy_order && (
              <BaitFlag multiple={sellOutlierMultiple(o.price, bestSell)} t={t} />
            )}
            {formatMarketIsk(o.price)}
          </>
        ),
        sortValue: (o) => o.price,
      },
      fees: {
        id: 'fees',
        header: t('market.feesColumn'),
        width: '16ch',
        align: 'right',
        className: 'tabular-nums text-text-dim',
        stackAffix: { before: t('market.feesAffix') },
        render: (o) => (feeContext === null ? '—' : formatMarketIsk(orderFees(o, feeContext).fees)),
        sortValue: (o) => (feeContext === null ? undefined : orderFees(o, feeContext).fees),
      },
      finalPrice: {
        id: 'finalPrice',
        header: t('market.finalPriceColumn'),
        width: COL_ISK,
        align: 'right',
        className: 'tabular-nums',
        stackAffix: { before: t('market.finalPriceAffix') },
        render: (o) =>
          feeContext === null ? '—' : formatMarketIsk(orderFees(o, feeContext).finalPrice),
        sortValue: (o) => (feeContext === null ? undefined : orderFees(o, feeContext).finalPrice),
      },
      quantity: {
        id: 'quantity',
        header: t('market.quantityColumn'),
        width: COL_QUANTITY,
        align: 'right',
        className: 'tabular-nums',
        stackAffix: { before: t('market.quantityAffix') },
        render: (o) => formatVolume(o.volume_remain),
        sortValue: (o) => o.volume_remain,
      },
      location: {
        id: 'location',
        header: t('market.location'),
        // Table mode only — a long station name was squeezing this column
        // and wrapping rows across several lines. The stacked-card media
        // query overrides `white-space`/width below `sm`, so phone keeps
        // the full, untruncated name.
        // Truncated (the full name is in the row's tooltip and its expanded
        // row), and only as wide as the screen can spare, so the book never
        // scrolls sideways beside the finder column.
        // Chosen with `cards` (ADR 0017): a card forced on a desktop is
        // titled by the station, uncapped; a table row caps it.
        // Squeezed before the rows give up to cards (`orderBookWidthsRem`).
        className: cards ? '' : ORDER_BOOK_LOCATION_CLASS[locationSqueezed ? 'squeezed' : 'roomy'],
        // The phone card's title: the station a pilot would fly to.
        primary: true,
        sortValue: (o) =>
          resolveOrderLocation(o, npcStationMap, solarSystemMap).stationName ?? undefined,
        render: (o) => (
          <LocationCell
            order={o}
            npcStations={npcStationMap}
            solarSystems={solarSystemMap}
            t={t}
            card={cards}
          />
        ),
      },
      security: {
        id: 'security',
        header: t('market.securityColumn'),
        width: '10ch',
        align: 'right',
        className: 'tabular-nums',
        sortValue: (o) => resolveOrderLocation(o, npcStationMap, solarSystemMap).security,
        render: (o) => (
          <SecurityCell order={o} npcStations={npcStationMap} solarSystems={solarSystemMap} t={t} />
        ),
      },
      jumps: {
        id: 'jumps',
        header: t('market.jumpsColumn'),
        width: COL_SMALL_NUMBER,
        align: 'right',
        className: 'tabular-nums',
        sortFirst: 'asc',
        sortValue: (o) => {
          const cell = orderJumps(o.system_id);
          return cell.kind === 'value' ? (cell.count ?? undefined) : undefined;
        },
        render: (o) => {
          const cell = orderJumps(o.system_id);
          return (
            <>
              {renderJumpsCell(cell, t, 'market.jumpsUnavailableHint', o.system_id)}
              {/* The phone card has no Jumps header to say what the bare number is. */}
              {cards && cell.kind === 'value' && cell.count !== null && (
                <> {t('market.jumpsWord', { count: cell.count })}</>
              )}
            </>
          );
        },
      },
      expiry: {
        id: 'expiry',
        header: t('market.expiry'),
        width: COL_DATE,
        // Shown or hidden by the column picker alone, never by width; the
        // card keeps it too, behind a word saying what the date is.
        className: 'whitespace-nowrap text-text-dim',
        stackAffix: { before: t('market.expiryAffix') },
        render: (o) => formatDateOnly(orderExpiry(o), timeZone),
        sortValue: (o) => orderExpiry(o).getTime(),
      },
      range: {
        id: 'range',
        header: t('market.range'),
        width: '14ch',
        className: 'text-text-dim',
        // Station < solarsystem < N jumps < region, in that order — not
        // alphabetical, which would put "region" ahead of "station".
        stackAffix: { before: t('market.rangeAffix') },
        sortValue: (o) => rangeRank(o.range),
        render: (o) => rangeLabel(o.range, t),
      },
      minVolume: {
        id: 'minVolume',
        header: t('market.minVolume'),
        width: COL_QUANTITY,
        align: 'right',
        // Off by default (`DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS`), then
        // shown or hidden by the column picker alone, as Expires is.
        className: 'tabular-nums',
        stackAffix: { before: t('market.minVolumeAffix') },
        render: (o) => formatVolume(o.min_volume),
        sortValue: (o) => o.min_volume,
      },
    }),
    [
      t,
      npcStationMap,
      solarSystemMap,
      myOrderIds,
      orderJumps,
      bestSell,
      cards,
      locationSqueezed,
      visibleOrderColumns,
      feeContext,
      timeZone,
    ]
  );

  // The two fee columns say what they assume, and it differs by table: a
  // sell order is priced as a listing of your own at that price, a buy order
  // as a sale into it right now (`engine/market/orderFees.ts`).
  const withFeeTooltips = useCallback(
    (ids: readonly MarketOrderColumnId[], side: 'sell' | 'buy') =>
      ids
        .filter((id) => visibleOrderColumns.includes(id))
        .map((id) =>
          id === 'fees' || id === 'finalPrice'
            ? {
                ...orderColumnsById[id],
                headerTooltip: feeColumnTooltip(t, id, side),
              }
            : orderColumnsById[id]
        ),
    [visibleOrderColumns, orderColumnsById, t]
  );
  const baseColumns = useMemo<DataTableColumn<RegionOrder>[]>(
    () => withFeeTooltips(SELL_ORDER_COLUMN_IDS, 'sell'),
    [withFeeTooltips]
  );
  const buyColumns = useMemo<DataTableColumn<RegionOrder>[]>(
    () => withFeeTooltips(BUY_ORDER_COLUMN_IDS, 'buy'),
    [withFeeTooltips]
  );
  // What each table's row expand (`OrderDetailPanel`) shows that the visible
  // columns don't — the picker's hidden ids, per table, since Sell and Buy
  // don't offer the same columns to begin with. The unticked fee columns land
  // here by default.
  const sellHiddenColumns = useMemo(
    () =>
      SELL_ORDER_COLUMN_IDS.filter(
        (id) =>
          !visibleOrderColumns.includes(id) && !isColumnWithheld(id, { hideLocation, feeContext })
      ),
    [visibleOrderColumns, hideLocation, feeContext]
  );
  const buyHiddenColumns = useMemo(
    () =>
      BUY_ORDER_COLUMN_IDS.filter(
        (id) =>
          !visibleOrderColumns.includes(id) && !isColumnWithheld(id, { hideLocation, feeContext })
      ),
    [visibleOrderColumns, hideLocation, feeContext]
  );

  return {
    visibleOrderColumns,
    toggleOrderColumn,
    orderColumnsById,
    baseColumns,
    buyColumns,
    sellHiddenColumns,
    buyHiddenColumns,
  };
}
