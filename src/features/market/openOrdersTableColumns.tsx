/**
 * The fix list's table columns: Item, What's wrong, Do this and ISK tied up
 * always; the five `OPEN_ORDER_COLUMN_IDS` between Do this and ISK tied up
 * when the Columns menu turns them on. Every figure is in full ISK
 * (`formatMarketIsk`) except the ISK tied up total (`IskAmount`).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, type DataTableColumn } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { roundPriceUp } from '@/engine/market/priceTick';
import { formatMarketIsk } from '@/lib/isk';
import { CharacterBadge } from '@/features/character/assetBrowserRows';
import type { OpenOrderRow } from './openOrdersModel';
import { OPEN_ORDER_COLUMN_IDS, type OpenOrderColumnId } from './openOrdersColumns';
import { OrderProblemBadge } from './OrderProblemBadge';
import { adviseOrder } from './orderAdvice';
import { orderDoThis } from './orderDoThis';
import { OrderDoThisText } from './OrderDoThisText';
import { formatOrderRemaining } from './orderRowFormat';
import { WorkThroughTableSlot } from './WorkThroughControls';

/** Days left at or under this read in the warning colour. */
const EXPIRES_SOON_DAYS = 7;

/** "Jita IV - Moon 4 - Caldari Navy Assembly Plant" -> "Jita IV"; the full name is in the detail. */
export function stationShortName(name: string): string {
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
  /** Every column in table order for the optional ones that are on. */
  columns: (visible: readonly OpenOrderColumnId[]) => DataTableColumn<OpenOrderRow>[];
  /** The optional columns, for `ColumnPickerMenu`'s labels. */
  optional: Record<OpenOrderColumnId, DataTableColumn<OpenOrderRow>>;
}

export function useOpenOrderTableColumns({
  showCharacter,
}: {
  /** More than one Character has orders: tag each row with its owner. */
  showCharacter: boolean;
}): OpenOrderTableColumns {
  const { t } = useTranslation();
  return useMemo(() => {
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
        cardCorner: true,
        className: 'whitespace-nowrap',
        render: (row) => {
          const { badge } = adviseOrder(row);
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
        render: (row) => {
          const advice = adviseOrder(row);
          return (
            <WorkThroughTableSlot
              row={row}
              fallback={<OrderDoThisText call={orderDoThis(row, advice)} badge={advice.badge} />}
            />
          );
        },
      },
    ];

    const optional: Record<OpenOrderColumnId, DataTableColumn<OpenOrderRow>> = {
      price: {
        id: 'price',
        header: t('market.orders.fixList.colPrice'),
        ...figure,
        sortValue: (row) => row.price,
        render: (row) => formatMarketIsk(row.price),
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
              {formatMarketIsk(roundPriceUp(row.floor.relist) ?? row.floor.relist)}
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
      render: (row) => (
        // Off the phone card: line two is the call, and the detail has it.
        <span data-dense-omit>
          <IskAmount value={row.iskTiedUp} />
        </span>
      ),
    };

    return {
      optional,
      columns: (visible) => [
        ...fixed,
        ...OPEN_ORDER_COLUMN_IDS.filter((id) => visible.includes(id)).map((id) => optional[id]),
        tiedUp,
      ],
    };
  }, [t, showCharacter]);
}
