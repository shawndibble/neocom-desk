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
  isLowVolume,
  iskPerLpTone,
} from '@/features/loyalty/offerRowDisplay';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';

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
  playerLp?: number | null;
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
        stackAffix: { after: t('loyaltyStore.perDayAffix') },
        cardCorner: cornerId === 'sellsPerDay',
        sortValue: (row) => row.sellsPerDay ?? undefined,
        cellClassName: (row) =>
          `tabular-nums${isPhone && cornerId !== 'sellsPerDay' && isLowVolume(row) ? ' text-warning!' : ''}`,
        render: (row) => {
          if (row.sellsPerDay === null) return '—';
          if (row.sellsPerDay === 0) return t('loyaltyStore.sellsNone');
          return (
            <>
              {isPhone && cornerId !== 'sellsPerDay' && isLowVolume(row) && (
                <span className="sr-only">{t('loyaltyStore.lowVolumeTag')}: </span>
              )}
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
        cardCorner: cornerId === 'iskPerLp',
        sortValue: (row) => shownIskPerLp(row) ?? undefined,
        cellClassName: (row) => `font-semibold tabular-nums ${iskPerLpTone(shownIskPerLp(row))}`,
        render: (row) => {
          if (lpBasis === 'concord' && concordPending) return '—';
          if (lpBasis === 'concord' && !concord) {
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
    [t, lpBasis, concord, concordPending, shownIskPerLp, cornerId, isPhone]
  );
  const phoneWarnsInSells = isPhone && isColumnVisible('sellsPerDay') && cornerId !== 'sellsPerDay';
  const itemColumn = useMemo<DataTableColumn<LoyaltyOfferRow>>(
    () => ({
      id: 'item',
      header: t('loyaltyStore.colItem'),
      primary: true,
      minWidth: '14rem',
      sortValue: (row) => row.itemName,
      render: (row) => (
        <LoyaltyOfferItemCell
          row={row}
          showCost={!isPhone}
          lowVolumeTag={!phoneWarnsInSells}
          playerLp={playerLp}
        />
      ),
    }),
    [t, phoneWarnsInSells, isPhone, playerLp]
  );
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
