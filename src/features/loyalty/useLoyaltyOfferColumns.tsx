import { useIsPhone } from '@/lib/useIsPhone';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { IskAmount, type DataTableColumn } from '@/components/ui';
import { COL_ISK } from '@/components/ui/dataTableWidths';
import { iskPerConcordLp, type ConcordRate } from '@/engine/loyalty/concordExchange';
import {
  LOYALTY_STORE_OFFERS_COLUMN_IDS,
  type LoyaltyStoreOffersColumnId,
} from '@/features/loyalty/loyaltyStoreColumns';
import type { LpBasis } from '@/features/loyalty/lpBasis';
import { LoyaltyOfferCost, LoyaltyOfferItemCell, PhoneUnit } from '@/features/loyalty/OfferDetail';
import {
  formatIskPerLp,
  formatSellsPerDay,
  iskPerLpTone,
} from '@/features/loyalty/offerRowDisplay';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';

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
  playerLp = null,
  sortColumnId,
}: {
  lpBasis: LpBasis;
  concord: ConcordRate | null;
  concordPending: boolean;
  isColumnVisible: (id: LoyaltyStoreOffersColumnId) => boolean;
  /** The pilot's LP: an offer they cannot yet afford says how much is missing. */
  playerLp?: number | null;
  /** The table's active sort column: on a phone its value is the card's bold figure. */
  sortColumnId?: string;
}) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const shownIskPerLp = useCallback(
    (row: LoyaltyOfferRow): number | null =>
      lpBasis === 'concord'
        ? concord
          ? iskPerConcordLp(row.profit.iskPerLp, concord.rate)
          : null
        : row.profit.iskPerLp,
    [lpBasis, concord]
  );
  // The phone card's bold figure follows the sort when the sorted column is one of the
  // three; sorting by name, or by a column the picker has hidden, leaves it on ISK / LP.
  const cornerId: LoyaltyStoreOffersColumnId =
    LOYALTY_STORE_OFFERS_COLUMN_IDS.find((id) => id === sortColumnId && isColumnVisible(id)) ??
    'iskPerLp';
  const optionalColumns = useMemo<
    Record<LoyaltyStoreOffersColumnId, DataTableColumn<LoyaltyOfferRow>>
  >(
    () => ({
      sellsPerDay: {
        id: 'sellsPerDay',
        header: t('loyaltyStore.colSellsPerDay'),
        align: 'right',
        width: '12ch',
        headerClassName: 'whitespace-nowrap',
        // Unavailable sorts last, apart from a real zero.
        stackAffix: { after: t('loyaltyStore.perDayAffix') },
        cardCorner: cornerId === 'sellsPerDay',
        sortValue: (row) => row.sellsPerDay ?? undefined,
        cellClassName: () => 'tabular-nums',
        render: (row) => {
          if (row.sellsPerDay === null) return '—';
          if (row.sellsPerDay === 0) return t('loyaltyStore.sellsNone');
          return (
            <>
              {formatSellsPerDay(row.sellsPerDay)}
              {cornerId === 'sellsPerDay' && <PhoneUnit>{t('loyaltyStore.perDayAffix')}</PhoneUnit>}
            </>
          );
        },
      },
      profit: {
        id: 'profit',
        header: t('loyaltyStore.colProfit'),
        align: 'right',
        width: COL_ISK,
        stackAffix: { after: t('loyaltyStore.profitAffix') },
        sortValue: (row) => row.profit.profit ?? undefined,
        cellClassName: (row) => iskPerLpTone(row.profit.profit),
        cardCorner: cornerId === 'profit',
        render: (row) =>
          row.profit.profit === null ? (
            '—'
          ) : (
            <>
              <IskAmount value={row.profit.profit} decimals={0} />
              {cornerId === 'profit' && (
                <PhoneUnit>{t('loyaltyStore.profitAffix').trim()}</PhoneUnit>
              )}
            </>
          ),
      },
      iskPerLp: {
        id: 'iskPerLp',
        header: t(
          lpBasis === 'concord' ? 'loyaltyStore.colIskPerConcordLp' : 'loyaltyStore.colIskPerLp'
        ),
        align: 'right',
        width: '14ch',
        headerClassName: 'whitespace-nowrap',
        stackAffix: { after: ` ${t('loyaltyStore.iskPerLpUnit')}` },
        // The phone's dense card has no header row: the bold figure sits at the title line's right.
        cardCorner: cornerId === 'iskPerLp',
        sortValue: (row) => shownIskPerLp(row) ?? undefined,
        cellClassName: (row) => `font-semibold tabular-nums ${iskPerLpTone(shownIskPerLp(row))}`,
        render: (row) => {
          if (lpBasis === 'concord' && concordPending) return '—';
          if (lpBasis === 'concord' && !concord) {
            // The phone's corner is one unwrapped line beside the name: a dash there, the sentence in the table.
            return (
              <>
                <span className="max-sm:hidden">{t('loyaltyStore.noConcordExchange')}</span>
                <span className="sm:hidden">—</span>
              </>
            );
          }
          const value = shownIskPerLp(row);
          if (value === null) return '—';
          return (
            <>
              {formatIskPerLp(value)}
              {cornerId === 'iskPerLp' && <PhoneUnit>{t('loyaltyStore.iskPerLpUnit')}</PhoneUnit>}
            </>
          );
        },
      },
    }),
    [t, lpBasis, concord, concordPending, shownIskPerLp, cornerId]
  );
  const itemColumn = useMemo<DataTableColumn<LoyaltyOfferRow>>(
    () => ({
      id: 'item',
      header: t('loyaltyStore.colItem'),
      primary: true,
      // The one width-less column. A windowed table lays out fixed, where it
      // takes what the sized columns leave and its floor is `minWidth` (the
      // two-line name + cost cell), so the table scrolls in its wrapper below it.
      minWidth: '14rem',
      sortValue: (row) => row.itemName,
      render: (row) => <LoyaltyOfferItemCell row={row} showCost={!isPhone} playerLp={playerLp} />,
    }),
    [t, isPhone, playerLp]
  );
  // The dense phone card prints every non-title cell on its meta line, so the price
  // the table keeps under the name becomes a cell of its own there.
  const costColumn = useMemo<DataTableColumn<LoyaltyOfferRow>>(
    () => ({
      id: 'cost',
      header: t('loyaltyStore.colCost'),
      width: '14ch',
      render: (row) => <LoyaltyOfferCost row={row} playerLp={playerLp} />,
    }),
    [t, playerLp]
  );
  const columns = useMemo<DataTableColumn<LoyaltyOfferRow>[]>(
    () => [
      itemColumn,
      ...(isPhone ? [costColumn] : []),
      ...LOYALTY_STORE_OFFERS_COLUMN_IDS.filter(isColumnVisible).map((id) => optionalColumns[id]),
    ],
    [itemColumn, costColumn, isPhone, optionalColumns, isColumnVisible]
  );
  return { columns, optionalColumns };
}
