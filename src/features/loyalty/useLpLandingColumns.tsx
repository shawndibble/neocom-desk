/**
 * Columns of the LP Store landing's two tables (`lpLanding.ts`). Each table
 * has two fixed columns (its identity and its ranking figure, the latter the
 * phone card's corner) and optional ones the column picker controls. Cells
 * hold plain text: the row's click opens the store (DESIGN.md §6c Restraint).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTableDenseCell, IskAmount, type DataTableColumn } from '@/components/ui';
import { COL_ISK } from '@/components/ui/dataTableWidths';
import { HintText } from '@/components/ui/HintText';
import { concordRate, iskPerConcordLp } from '@/engine/loyalty/concordExchange';
import { lpRate } from '@/engine/loyalty/marketLpValue';
import { cx } from '@/lib/cx';
import { fixed1 } from '@/lib/fixedFormat';
import { formatCount } from '@/lib/formatCount';
import type { LpLandingOfferColumnId, LpLandingStoreColumnId } from './loyaltyStoreColumns';
import type { LpLandingOffer, LpLandingStore } from './lpLanding';
import { LoyaltyOfferItemCell } from './OfferDetail';
import { formatSellsPerDay, iskPerLpTone } from './offerRowDisplay';
import { FactionWarfareTag, NearestStationCell } from './LpLandingCells';

const CAPTION = 'text-[0.6875rem] text-text-dim';
const RANK_FIGURE = 'font-semibold tabular-nums';

export function useLpLandingStoreColumns({
  systemName,
  factionName,
  distancesKnown,
  pricing,
  valuing,
  ownLpValue,
}: {
  systemName: (systemId: number) => string | null;
  factionName: (factionId: number) => string | null;
  /** Distances resolved; until then a store without one is unknown, not unreachable. */
  distancesKnown: boolean;
  /** Offers are still being priced, so no store has a best offer yet. */
  pricing: boolean;
  /** LP Values are still being worked out. */
  valuing: boolean;
  /** The pilot's own LP Value (0 = each store's), so a balance's worth matches the summary's. */
  ownLpValue: number;
}) {
  const { t } = useTranslation();
  return useMemo(() => {
    const store: DataTableColumn<LpLandingStore> = {
      id: 'store',
      header: t('loyaltyStore.landing.colStore'),
      primary: true,
      minWidth: '13rem',
      sortValue: (row) => row.name,
      render: (row) => {
        // An unread faction list leaves the caption blank rather than saying "No faction".
        const faction =
          row.factionId === null ? t('loyaltyStore.landing.noFaction') : factionName(row.factionId);
        return (
          <span className="flex flex-col">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-accent">{row.name}</span>
              {row.factionWarfare && <FactionWarfareTag />}
            </span>
            {faction && <span className={cx(CAPTION, 'max-sm:hidden')}>{faction}</span>}
          </span>
        );
      },
    };
    const lpValue: DataTableColumn<LpLandingStore> = {
      id: 'lpValue',
      header: t('loyaltyStore.landing.colLpValue'),
      headerTooltip: t('loyaltyStore.landing.colLpValueHelp'),
      align: 'right',
      width: '11ch',
      headerClassName: 'whitespace-nowrap',
      cardCorner: true,
      sortValue: (row) => row.lpValue ?? undefined,
      sortFirst: 'desc',
      cellClassName: (row) => cx(RANK_FIGURE, iskPerLpTone(row.lpValue)),
      render: (row) => {
        if (row.lpValue !== null) return formatCount(Math.round(row.lpValue));
        return valuing ? '…' : '—';
      },
    };
    const optional: Record<LpLandingStoreColumnId, DataTableColumn<LpLandingStore>> = {
      yourLp: {
        id: 'yourLp',
        header: t('loyaltyStore.yourLp'),
        align: 'right',
        width: '12ch',
        headerClassName: 'whitespace-nowrap',
        sortValue: (row) => row.yourLp ?? undefined,
        sortFirst: 'desc',
        cellClassName: () => 'tabular-nums',
        stackAffix: { after: t('loyaltyStore.landing.lpSuffix') },
        render: (row) => {
          if (row.yourLp === null) {
            return (
              <span className="text-text-dim" data-dense-omit>
                —
              </span>
            );
          }
          const { rate } = lpRate(ownLpValue, row.lpValue);
          return (
            <DataTableDenseCell>
              <span className="inline-flex flex-col items-start sm:items-end">
                <span>{formatCount(row.yourLp)}</span>
                {rate !== null && (
                  <span className={cx(CAPTION, 'max-sm:hidden')}>
                    ≈ <IskAmount value={row.yourLp * rate} decimals={0} />
                  </span>
                )}
              </span>
            </DataTableDenseCell>
          );
        },
      },
      bestOffer: {
        id: 'bestOffer',
        header: t('loyaltyStore.landing.colBestOffer'),
        minWidth: '13rem',
        sortValue: (row) => row.best?.row.profit.iskPerLp ?? undefined,
        sortFirst: 'desc',
        stackAffix: { before: t('loyaltyStore.landing.bestPrefix') },
        render: (row) => {
          if (row.best === null) {
            if (pricing) return <span className="text-text-dim">…</span>;
            return (
              <span className="text-text-dim" data-dense-omit>
                {t('loyaltyStore.landing.noBestOffer')}
              </span>
            );
          }
          const { itemName, profit, sellsPerDay } = row.best.row;
          const iskPerLp = fixed1(profit.iskPerLp!);
          return (
            <span className="inline-flex flex-col">
              <span>{itemName}</span>
              <span className={cx(CAPTION, 'max-sm:hidden')}>
                {sellsPerDay === null
                  ? t('loyaltyStore.landing.bestOfferMetaNoVolume', { iskPerLp })
                  : t('loyaltyStore.landing.bestOfferMeta', {
                      iskPerLp,
                      sells: formatSellsPerDay(sellsPerDay),
                    })}
              </span>
            </span>
          );
        },
      },
      offers: {
        id: 'offers',
        header: t('loyaltyStore.landing.colOffers'),
        align: 'right',
        width: '9ch',
        sortValue: (row) => row.offerCount,
        sortFirst: 'desc',
        cellClassName: () => 'tabular-nums',
        stackAffix: { after: t('loyaltyStore.landing.offersSuffix') },
        render: (row) => formatCount(row.offerCount),
      },
      concord: {
        id: 'concord',
        header: t('loyaltyStore.colIskPerConcordLp'),
        align: 'right',
        width: '16ch',
        headerClassName: 'whitespace-nowrap',
        sortValue: (row) => concordValue(row) ?? undefined,
        sortFirst: 'desc',
        cellClassName: (row) => cx('tabular-nums', iskPerLpTone(concordValue(row))),
        render: (row) => {
          if (concordRateOf(row) === null) {
            return <span className="text-text-dim">{t('loyaltyStore.noConcordExchange')}</span>;
          }
          const value = concordValue(row);
          return value === null ? '—' : formatCount(Math.round(value));
        },
      },
      nearest: {
        id: 'nearest',
        header: t('loyaltyStore.landing.colNearest'),
        align: 'right',
        width: '16ch',
        sortValue: (row) => row.nearest?.jumps,
        sortFirst: 'asc',
        render: (row) => {
          if (row.nearest !== null) {
            return <NearestStationCell nearest={row.nearest} systemName={systemName} align="end" />;
          }
          if (!distancesKnown) {
            return (
              <span className="text-text-dim" data-dense-omit>
                —
              </span>
            );
          }
          return (
            <HintText content={t('loyaltyStore.landing.noRouteHelp')} className="text-text-dim">
              {t('loyaltyStore.landing.noRoute')}
            </HintText>
          );
        },
      },
    };
    return { fixed: [store, lpValue] as const, optional };
  }, [t, systemName, factionName, distancesKnown, pricing, valuing, ownLpValue]);
}

function concordRateOf(row: LpLandingStore) {
  return concordRate({ id: row.corporationId, factionId: row.factionId ?? undefined });
}

/** The store's LP Value per CONCORD LP; null with no exchange or no LP Value. */
function concordValue(row: LpLandingStore): number | null {
  const rate = concordRateOf(row);
  return rate === null ? null : iskPerConcordLp(row.lpValue, rate.rate);
}

export function useLpLandingOfferColumns({
  systemName,
}: {
  systemName: (systemId: number) => string | null;
}) {
  const { t } = useTranslation();
  return useMemo(() => {
    const item: DataTableColumn<LpLandingOffer> = {
      id: 'item',
      header: t('loyaltyStore.colItem'),
      primary: true,
      minWidth: '13rem',
      sortValue: (offer) => offer.row.itemName,
      render: ({ row }) => <LoyaltyOfferItemCell row={row} />,
    };
    const iskPerLp: DataTableColumn<LpLandingOffer> = {
      id: 'iskPerLp',
      header: t('loyaltyStore.colIskPerLp'),
      align: 'right',
      width: '11ch',
      headerClassName: 'whitespace-nowrap',
      cardCorner: true,
      sortValue: (offer) => offer.row.profit.iskPerLp ?? undefined,
      sortFirst: 'desc',
      cellClassName: (offer) => cx(RANK_FIGURE, iskPerLpTone(offer.row.profit.iskPerLp)),
      render: (offer) =>
        offer.row.profit.iskPerLp === null ? '—' : fixed1(offer.row.profit.iskPerLp),
    };
    const optional: Record<LpLandingOfferColumnId, DataTableColumn<LpLandingOffer>> = {
      store: {
        id: 'store',
        header: t('loyaltyStore.landing.colStore'),
        minWidth: '11rem',
        // By distance, nearest first: a searched item lists its closest seller on top.
        sortValue: (offer) => offer.store.nearest?.jumps,
        sortFirst: 'asc',
        render: ({ store }) => (
          <NearestStationCell
            nearest={store.nearest}
            systemName={systemName}
            label={
              <>
                {store.name}
                {store.factionWarfare && <FactionWarfareTag />}
              </>
            }
          />
        ),
      },
      turnIns: {
        id: 'turnIns',
        header: t('loyaltyStore.landing.colTurnIns'),
        width: '10ch',
        headerClassName: 'whitespace-nowrap',
        sortValue: (offer) => offer.row.requiredItems.length,
        stackAffix: { before: t('loyaltyStore.landing.turnInsPrefix') },
        render: ({ row }) =>
          row.requiredItems.length === 0 ? (
            <span className="text-text-dim" data-dense-omit>
              {t('loyaltyStore.landing.turnInsNone')}
            </span>
          ) : (
            <HintText
              content={row.requiredItems
                .map((line) => `${formatCount(line.quantity)} × ${line.name}`)
                .join(', ')}
            >
              {t('loyaltyStore.landing.turnInsCount', { count: row.requiredItems.length })}
            </HintText>
          ),
      },
      sellsPerDay: {
        id: 'sellsPerDay',
        header: t('loyaltyStore.colSellsPerDay'),
        align: 'right',
        width: '11ch',
        headerClassName: 'whitespace-nowrap',
        // Unavailable sorts last, apart from a real zero.
        sortValue: (offer) => offer.row.sellsPerDay ?? undefined,
        sortFirst: 'desc',
        cellClassName: () => 'tabular-nums',
        stackAffix: { after: t('loyaltyStore.landing.perDaySuffix') },
        render: ({ row }) => {
          if (row.sellsPerDay === null) return <span data-dense-omit>—</span>;
          if (row.sellsPerDay === 0) return t('loyaltyStore.sellsNone');
          return formatSellsPerDay(row.sellsPerDay);
        },
      },
      profit: {
        id: 'profit',
        header: t('loyaltyStore.colProfit'),
        align: 'right',
        width: COL_ISK,
        sortValue: (offer) => offer.row.profit.profit ?? undefined,
        sortFirst: 'desc',
        cellClassName: (offer) => iskPerLpTone(offer.row.profit.profit),
        stackAffix: { after: t('loyaltyStore.landing.profitSuffix') },
        render: ({ row }) =>
          row.profit.profit === null ? (
            <span data-dense-omit>—</span>
          ) : (
            <IskAmount value={row.profit.profit} decimals={0} />
          ),
      },
    };
    return { fixed: [item, iskPerLp] as const, optional };
  }, [t, systemName]);
}
