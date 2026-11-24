/**
 * The fix list's table columns: Item, What's wrong, Do this and ISK tied up
 * always; the five `OPEN_ORDER_COLUMN_IDS` between Do this and ISK tied up
 * when the Columns menu turns them on. Every figure is in full ISK
 * (`formatMarketIsk`) except the ISK tied up total (`IskAmount`).
 *
 * A buy order an Active campaign turn-in pays more than its bid, or a sell
 * order it beats whose column an undercut won, keeps its state and gets a dim
 * `TurnInGlyph` after its price (after Do this while the Price column is off);
 * it and a sell order's "Turn in instead" open the order's Order Detail, which
 * shows the turn-in (#6708).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, type DataTableColumn } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { DEFAULT_PROBLEM_THRESHOLDS } from '@/engine/market/orderProblems';
import { formatMarketIsk } from '@/lib/isk';
import { CharacterBadge } from '@/features/assets/assetBrowserRows';
import { TurnInGlyph } from '@/features/campaigns/TurnInDetail';
import { problemRank, type OpenOrderRow } from './openOrdersModel';
import { OPEN_ORDER_COLUMN_IDS, type OpenOrderColumnId } from './openOrdersColumns';
import { OrderProblemBadge } from './OrderProblemBadge';
import { rowFixCall } from './orderDoThis';
import { OrderDoThisText } from './OrderDoThisText';
import { orderTurnInGlyph } from './orderTurnIn';
import { formatOrderFloorPrice, formatOrderRemaining } from './orderRowFormat';
import { WorkThroughTableSlot } from './WorkThroughControls';

/** Expiry reads in the warning colour from the day the order files as expiring. */
const EXPIRES_SOON_DAYS = DEFAULT_PROBLEM_THRESHOLDS.expiringWithinDays;

/** "Jita IV - Moon 4 - Caldari Navy Assembly Plant" -> "Jita IV"; the full name is in the detail. */
function stationShortName(name: string): string {
  const dashIndex = name.indexOf(' - ');
  return dashIndex === -1 ? name : name.slice(0, dashIndex);
}

const dash = <span className="text-text-dim">—</span>;

const figure = {
  align: 'right',
  headerClassName: 'whitespace-nowrap',
  className: 'tabular-nums whitespace-nowrap',
} as const;

export interface OpenOrderTableColumns {
  /** Fixed + visible optional columns, table order. */
  columns: DataTableColumn<OpenOrderRow>[];
  /** The optional columns, for `ColumnPickerMenu`'s labels. */
  optional: Record<OpenOrderColumnId, DataTableColumn<OpenOrderRow>>;
}

/** A row whose turn-in pays more but its column says something else (`orderTurnInGlyph`): the glyph that opens it. */
function turnInGlyph(row: OpenOrderRow, onOpenTurnIn?: (row: OpenOrderRow) => void) {
  return (
    orderTurnInGlyph(row) &&
    onOpenTurnIn && <TurnInGlyph name={row.typeName} onClick={() => onOpenTurnIn(row)} />
  );
}

export function useOpenOrderTableColumns({
  showCharacter,
  visible,
  onOpenTurnIn,
}: {
  /** More than one Character has orders: tag each row with its owner. */
  showCharacter: boolean;
  visible: readonly OpenOrderColumnId[];
  /** Opens a row's turn-in in its Order Detail: "Turn in instead" and a buy order's glyph. */
  onOpenTurnIn?: (row: OpenOrderRow) => void;
}): OpenOrderTableColumns {
  const { t } = useTranslation();
  const priceShown = visible.includes('price');
  const defs = useMemo(() => {
    const fixed: DataTableColumn<OpenOrderRow>[] = [
      {
        id: 'item',
        header: t('orders.item'),
        primary: true,
        sortValue: (row) => row.typeName,
        render: (row) => (
          <span className="block min-w-0">
            <span className={entityLinkClassName('font-medium')}>{row.typeName}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-dim max-sm:hidden">
              <span className="whitespace-nowrap">
                {row.stationName === null
                  ? t('market.unknownStructure')
                  : stationShortName(row.stationName)}
                {row.isBuyOrder && ` · ${t('market.orders.fixList.buyOrder')}`}
              </span>
              {showCharacter && (
                <span className="-ml-1.5">
                  <CharacterBadge characterName={row.characterName} />
                </span>
              )}
            </span>
          </span>
        ),
      },
      {
        id: 'problem',
        header: t('market.orders.fixList.colProblem'),
        className: 'whitespace-nowrap',
        // Worst first, the fix list's own order.
        sortValue: (row) => problemRank(row.problem),
        sortFirst: 'asc',
        render: (row) => {
          const { badge } = rowFixCall(row).advice;
          return (
            badge && (
              <OrderProblemBadge kind={badge.kind} detail={badge.detail} interactive={false} />
            )
          );
        },
      },
      {
        id: 'doThis',
        header: t('market.orders.fixList.colDoThis'),
        className: 'font-semibold',
        render: (row) => (
          <WorkThroughTableSlot
            row={row}
            fallback={
              <>
                <OrderDoThisText row={row} onOpenTurnIn={onOpenTurnIn} />
                {!priceShown && turnInGlyph(row, onOpenTurnIn)}
              </>
            }
          />
        ),
      },
    ];

    const optional: Record<OpenOrderColumnId, DataTableColumn<OpenOrderRow>> = {
      price: {
        id: 'price',
        header: t('market.orders.fixList.colPrice'),
        ...figure,
        sortValue: (row) => row.price,
        render: (row) => (
          <>
            {formatMarketIsk(row.price)}
            {turnInGlyph(row, onOpenTurnIn)}
          </>
        ),
      },
      stationCheapest: {
        id: 'stationCheapest',
        header: t('market.orders.fixList.colStationCheapest'),
        ...figure,
        sortValue: (row) =>
          row.station.beatsMe ? (row.station.bestPrice ?? undefined) : undefined,
        render: (row) =>
          row.station.beatsMe && row.station.bestPrice !== null ? (
            <span>
              {formatMarketIsk(row.station.bestPrice)}
              {row.isBuyOrder && (
                <span className="text-text-dim"> {t('market.orders.fixList.bid')}</span>
              )}
            </span>
          ) : (
            dash
          ),
      },
      floor: {
        id: 'floor',
        header: t('market.orders.floorLabel'),
        ...figure,
        // Sorted by the exact break-even, unaffected by the rounded-up figure
        // the cell shows (issue #1421).
        sortValue: (row) => row.floor?.relist,
        render: (row) =>
          row.floor ? (
            <span className={row.price < row.floor.relist ? 'text-isk-neg' : undefined}>
              {formatOrderFloorPrice(row.floor)}
            </span>
          ) : (
            dash
          ),
      },
      remaining: {
        id: 'remaining',
        header: t('orders.remaining'),
        ...figure,
        sortValue: (row) => (row.volumeTotal > 0 ? row.volumeRemain / row.volumeTotal : 0),
        render: (row) => formatOrderRemaining(row.volumeRemain, row.volumeTotal),
      },
      expires: {
        id: 'expires',
        header: t('orders.expires'),
        ...figure,
        sortValue: (row) => row.expiry?.expiresAt,
        render: (row) =>
          row.expiry ? (
            <span className={row.expiry.daysLeft <= EXPIRES_SOON_DAYS ? 'text-warning' : undefined}>
              {t('market.orders.fixList.daysLeft', { count: row.expiry.daysLeft })}
            </span>
          ) : (
            dash
          ),
      },
    };

    const tiedUp: DataTableColumn<OpenOrderRow> = {
      id: 'iskTiedUp',
      header: t('market.orders.fixList.colIskTiedUp'),
      ...figure,
      sortValue: (row) => row.iskTiedUp,
      render: (row) => <IskAmount value={row.iskTiedUp} />,
    };

    return { fixed, optional, tiedUp };
  }, [t, showCharacter, priceShown, onOpenTurnIn]);

  return useMemo(
    () => ({
      optional: defs.optional,
      columns: [
        ...defs.fixed,
        ...OPEN_ORDER_COLUMN_IDS.filter((id) => visible.includes(id)).map(
          (id) => defs.optional[id]
        ),
        defs.tiedUp,
      ],
    }),
    [defs, visible]
  );
}
