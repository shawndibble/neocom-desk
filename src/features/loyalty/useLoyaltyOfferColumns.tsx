import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, type DataTableColumn } from '@/components/ui';
import { iskPerConcordLp, type ConcordRate } from '@/engine/loyalty/concordExchange';
import {
  LOYALTY_STORE_OFFERS_COLUMN_IDS,
  type LoyaltyStoreOffersColumnId,
} from '@/features/loyalty/loyaltyStoreColumns';
import type { LpBasis } from '@/features/loyalty/lpBasis';
import { LoyaltyItemName } from '@/features/loyalty/OfferDetail';
import { iskPerLpTone } from '@/features/loyalty/offerRowDisplay';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import { formatCount } from '@/lib/formatCount';

/**
 * The offers table's columns: the identity column (never hidden) plus the optional
 * columns the picker controls, in `LOYALTY_STORE_OFFERS_COLUMN_IDS` order.
 * `optionalColumns` is the full set, for the picker. Memoized so the `sortValue`s
 * `DataTable` keys its sort on keep their identity across renders (a keystroke in the
 * search box re-renders the page).
 */
export function useLoyaltyOfferColumns({
  lpBasis,
  concord,
  concordPending,
  isColumnVisible,
}: {
  lpBasis: LpBasis;
  concord: ConcordRate | null;
  concordPending: boolean;
  isColumnVisible: (id: LoyaltyStoreOffersColumnId) => boolean;
}) {
  const { t } = useTranslation();
  const shownIskPerLp = useCallback(
    (row: LoyaltyOfferRow): number | null =>
      lpBasis === 'concord'
        ? concord
          ? iskPerConcordLp(row.profit.iskPerLp, concord.rate)
          : null
        : row.profit.iskPerLp,
    [lpBasis, concord]
  );
  const optionalColumns = useMemo<
    Record<LoyaltyStoreOffersColumnId, DataTableColumn<LoyaltyOfferRow>>
  >(
    () => ({
      profit: {
        id: 'profit',
        header: t('loyaltyStore.colProfit'),
        align: 'right',
        sortValue: (row) => row.profit.profit ?? undefined,
        cellClassName: (row) => iskPerLpTone(row.profit.profit),
        render: (row) =>
          row.profit.profit === null ? '—' : <IskAmount value={row.profit.profit} decimals={0} />,
      },
      iskPerLp: {
        id: 'iskPerLp',
        header: t(
          lpBasis === 'concord' ? 'loyaltyStore.colIskPerConcordLp' : 'loyaltyStore.colIskPerLp'
        ),
        align: 'right',
        headerClassName: 'whitespace-nowrap',
        sortValue: (row) => shownIskPerLp(row) ?? undefined,
        cellClassName: (row) => `font-semibold tabular-nums ${iskPerLpTone(shownIskPerLp(row))}`,
        render: (row) => {
          if (lpBasis === 'concord' && concordPending) return '—';
          if (lpBasis === 'concord' && !concord) return t('loyaltyStore.noConcordExchange');
          const value = shownIskPerLp(row);
          return value === null ? '—' : value.toFixed(1);
        },
      },
    }),
    [t, lpBasis, concord, concordPending, shownIskPerLp]
  );
  const itemColumn = useMemo<DataTableColumn<LoyaltyOfferRow>>(
    () => ({
      id: 'item',
      header: t('loyaltyStore.colItem'),
      primary: true,
      sortValue: (row) => row.itemName,
      render: (row) => (
        <span className="flex flex-col">
          <span className="inline-flex items-center gap-1.5">
            <LoyaltyItemName row={row} />
            {row.isBlueprint && (
              // `shrink-0` + `whitespace-nowrap`: as a flex item next to a
              // long item name the badge was being squeezed until "BP" broke
              // across two lines, one letter each.
              <span className="shrink-0 px-1 text-[0.6875rem] font-bold tracking-widest whitespace-nowrap text-warning uppercase">
                BP
              </span>
            )}
          </span>
          <span className="text-[0.6875rem] text-text-dim">
            {formatCount(row.offer.lp_cost)} LP +{' '}
            <IskAmount value={row.offer.isk_cost} decimals={0} />
          </span>
        </span>
      ),
    }),
    [t]
  );
  const columns = useMemo<DataTableColumn<LoyaltyOfferRow>[]>(
    () => [
      itemColumn,
      ...LOYALTY_STORE_OFFERS_COLUMN_IDS.filter(isColumnVisible).map((id) => optionalColumns[id]),
    ],
    [itemColumn, optionalColumns, isColumnVisible]
  );
  return { columns, optionalColumns };
}
