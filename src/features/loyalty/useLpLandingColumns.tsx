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
import { fixed1 } from '@/lib/fixedFormat';
import { formatCount } from '@/lib/formatCount';
import type { LpLandingOfferColumnId, LpLandingStoreColumnId } from './loyaltyStoreColumns';
import type { LpLandingOffer, LpLandingStore } from './lpLanding';
import { iskPerLpTone } from './offerRowDisplay';
import { FactionWarfareTag, Nearest } from './LpLandingCells';

const CAPTION = 'text-[0.6875rem] text-text-dim';

function sellsPerDayText(value: number): string {
  return value < 10 ? fixed1(value) : formatCount(value);
}

export function useLpLandingStoreColumns({
  systemName,
  factionName,
  distancesKnown,
  pricing,
  valuing,
}: {
  systemName: (systemId: number) => string | null;
  factionName: (factionId: number) => string | null;
  /** Distances resolved; until then a store without one is unknown, not unreachable. */
  distancesKnown: boolean;
  /** Offers are still being priced, so no store has a best offer yet. */
  pricing: boolean;
  /** LP Values are still being worked out. */
  valuing: boolean;
}) {
  const { t } = useTranslation();
  return useMemo(() => {
    const store: DataTableColumn<LpLandingStore> = {
      id: 'store',
      header: t('loyaltyStore.landing.colStore'),
      primary: true,
      minWidth: '14rem',
      sortValue: (row) => row.name,
      render: (row) => (
        <span className="flex flex-col">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-accent">{row.name}</span>
            {row.factionWarfare && <FactionWarfareTag />}
          </span>
          <span className={`${CAPTION} max-sm:hidden`}>
            {(row.factionId !== null ? factionName(row.factionId) : null) ??
              t('loyaltyStore.landing.noFaction')}
          </span>
        </span>
      ),
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
      cellClassName: (row) => `font-semibold tabular-nums ${iskPerLpTone(row.lpValue)}`,
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
        render: (row) =>
          row.yourLp === null ? (
            <span className="text-text-dim" data-dense-omit>
              —
            </span>
          ) : (
            <DataTableDenseCell>
              <span className="inline-flex flex-col items-start sm:items-end">
                <span>{formatCount(row.yourLp)}</span>
                {row.lpValue !== null && (
                  <span className={`${CAPTION} max-sm:hidden`}>
                    ≈ <IskAmount value={row.yourLp * row.lpValue} decimals={0} />
                  </span>
                )}
              </span>
            </DataTableDenseCell>
          ),
      },
      bestOffer: {
        id: 'bestOffer',
        header: t('loyaltyStore.landing.colBestOffer'),
        minWidth: '14rem',
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
              <span className={`${CAPTION} max-sm:hidden`}>
                {sellsPerDay === null
                  ? t('loyaltyStore.landing.bestOfferMetaNoVolume', { iskPerLp })
                  : t('loyaltyStore.landing.bestOfferMeta', {
                      iskPerLp,
                      sells: sellsPerDayText(sellsPerDay),
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
        cellClassName: (row) => `tabular-nums ${iskPerLpTone(concordValue(row))}`,
        render: (row) => {
          if (
            concordRate({ id: row.corporationId, factionId: row.factionId ?? undefined }) === null
          ) {
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
        render: (row) =>
          row.nearest !== null ? (
            <Nearest store={row} systemName={systemName} align="end" />
          ) : distancesKnown ? (
            <HintText content={t('loyaltyStore.landing.noRouteHelp')} className="text-text-dim">
              {t('loyaltyStore.landing.noRoute')}
            </HintText>
          ) : (
            <span className="text-text-dim" data-dense-omit>
              —
            </span>
          ),
      },
    };
    return { fixed: [store, lpValue] as const, optional };
  }, [t, systemName, factionName, distancesKnown, pricing, valuing]);
}

/** The store's LP Value per CONCORD LP; null with no exchange or no LP Value. */
function concordValue(row: LpLandingStore): number | null {
  const rate = concordRate({ id: row.corporationId, factionId: row.factionId ?? undefined });
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
      minWidth: '14rem',
      sortValue: (offer) => offer.row.itemName,
      render: ({ row }) => (
        <span className="flex flex-col">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-accent">{row.itemName}</span>
            {row.isBlueprint && (
              <span className="shrink-0 px-1 text-[0.6875rem] font-bold tracking-widest whitespace-nowrap text-warning uppercase">
                BP
              </span>
            )}
          </span>
          <span className={CAPTION}>
            {formatCount(row.offer.lp_cost)} LP +{' '}
            <IskAmount value={row.offer.isk_cost} decimals={0} />
          </span>
        </span>
      ),
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
      cellClassName: (offer) =>
        `font-semibold tabular-nums ${iskPerLpTone(offer.row.profit.iskPerLp)}`,
      render: (offer) =>
        offer.row.profit.iskPerLp === null ? '—' : fixed1(offer.row.profit.iskPerLp),
    };
    const optional: Record<LpLandingOfferColumnId, DataTableColumn<LpLandingOffer>> = {
      store: {
        id: 'store',
        header: t('loyaltyStore.landing.colStore'),
        minWidth: '12rem',
        // Nearest first: sorted by Store, a searched item lists its closest seller on top.
        sortValue: (offer) => offer.store.nearest?.jumps,
        render: ({ store }) => {
          const system = store.nearest ? systemName(store.nearest.systemId) : null;
          return (
            <DataTableDenseCell>
              <span className="flex flex-col">
                <span className="inline-flex items-center gap-1.5">
                  {store.name}
                  {store.factionWarfare && <FactionWarfareTag />}
                </span>
                {store.nearest !== null && (
                  <span className={`${CAPTION} max-sm:hidden`}>
                    {system ?? `#${store.nearest.systemId}`} ·{' '}
                    {t('loyaltyStore.landing.jumps', { count: store.nearest.jumps })}
                  </span>
                )}
              </span>
              {store.nearest !== null && (
                <span className="sm:hidden">
                  {t('loyaltyStore.landing.jumpsShort', { count: store.nearest.jumps })}
                </span>
              )}
            </DataTableDenseCell>
          );
        },
      },
      turnIns: {
        id: 'turnIns',
        header: t('loyaltyStore.landing.colTurnIns'),
        width: '11ch',
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
        width: '12ch',
        headerClassName: 'whitespace-nowrap',
        // Unavailable sorts last, apart from a real zero.
        sortValue: (offer) => offer.row.sellsPerDay ?? undefined,
        sortFirst: 'desc',
        cellClassName: () => 'tabular-nums',
        stackAffix: { after: t('loyaltyStore.landing.perDaySuffix') },
        render: ({ row }) => {
          if (row.sellsPerDay === null) return <span data-dense-omit>—</span>;
          if (row.sellsPerDay === 0) return t('loyaltyStore.sellsNone');
          return sellsPerDayText(row.sellsPerDay);
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
