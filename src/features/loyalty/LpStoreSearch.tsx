/**
 * The LP Store page's item-first search (issue #2873): one box for an item or a
 * corporation, results as stacked Panels grouped by item with the nearest
 * store first. A row opens that store with the offer selected
 * (`/market/lp-store/:corporationId?offer=`), carrying the query so the store
 * view can offer a crumb back here.
 */
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  EmptyState,
  IskAmount,
  LiveStatus,
  Panel,
  SearchInput,
  Spinner,
  type DataTableColumn,
} from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { iskToneClass } from '@/features/character/format';
import { useLpStoreSearch, type LpStoreSearchState } from './useLpStoreSearch';
import { lpStorePath, type ItemSearchStore, type LpSearchCrumbState } from './itemSearch';

function iskPerLpTone(value: number | null): string {
  return value === null ? 'text-text-dim' : iskToneClass(value);
}

function StoreCell({
  store,
  search,
}: {
  store: Pick<ItemSearchStore, 'corporationName' | 'nearestSystemId' | 'jumps'>;
  search: LpStoreSearchState;
}) {
  const { t } = useTranslation();
  const system = search.systemName(store.nearestSystemId);
  let caption: string | null = null;
  // Distances come from the snapshot's systems; without it a null reads as "no route".
  if (search.jumpsStatus === 'ready' && search.status === 'ready') {
    caption =
      store.jumps === null || system === null
        ? t('loyaltyStore.search.noRoute')
        : t('loyaltyStore.search.nearest', { system, count: store.jumps });
  }
  return (
    <span className="flex flex-col">
      <span>{store.corporationName}</span>
      {caption !== null && <span className="text-[0.6875rem] text-text-dim">{caption}</span>}
    </span>
  );
}

function JumpsNote({ status }: { status: LpStoreSearchState['jumpsStatus'] }) {
  const { t } = useTranslation();
  if (status === 'ready' || status === 'loading') return null;
  return (
    <p className="text-[0.6875rem] text-text-dim">
      {t(status === 'no-origin' ? 'loyaltyStore.search.noOrigin' : 'loyaltyStore.search.noGraph')}
    </p>
  );
}

export function LpStoreSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useLpStoreSearch(query);
  const { result } = search;
  const hasQuery = query.trim() !== '';
  const noMatches = result.groups.length === 0 && result.corporations.length === 0;
  let resultsStatus: string | null = null;
  if (hasQuery) {
    if (!noMatches) {
      resultsStatus = t('loyaltyStore.search.resultsStatus', {
        stores: t('loyaltyStore.search.storeCount', { count: result.corporations.length }),
        items: t('loyaltyStore.search.itemCount', { count: result.groups.length }),
      });
    } else if (search.status !== 'loading' && search.status !== 'unavailable') {
      resultsStatus = t('loyaltyStore.search.noResultsTitle');
    }
  }

  const columns: DataTableColumn<ItemSearchStore>[] = [
    {
      id: 'store',
      header: t('loyaltyStore.search.colStore'),
      primary: true,
      render: (store) => <StoreCell store={store} search={search} />,
    },
    {
      id: 'profit',
      header: t('loyaltyStore.colProfit'),
      align: 'right',
      cellClassName: (store) => iskPerLpTone(search.rowFor(store.offer)?.profit.profit ?? null),
      render: (store) => {
        const profit = search.rowFor(store.offer)?.profit.profit ?? null;
        if (profit !== null) return <IskAmount value={profit} decimals={0} />;
        return search.pricing ? '…' : '—';
      },
    },
    {
      id: 'iskPerLp',
      header: t('loyaltyStore.colIskPerLp'),
      align: 'right',
      headerClassName: 'whitespace-nowrap',
      cellClassName: (store) =>
        `font-semibold tabular-nums ${iskPerLpTone(search.rowFor(store.offer)?.profit.iskPerLp ?? null)}`,
      render: (store) => {
        const value = search.rowFor(store.offer)?.profit.iskPerLp ?? null;
        if (value !== null) return value.toFixed(1);
        return search.pricing ? '…' : '—';
      },
    },
  ];

  function openStore(store: ItemSearchStore) {
    navigate(lpStorePath(store.corporationId, store.offer.offer_id), {
      state: { from: 'lp-search', q: query } satisfies LpSearchCrumbState,
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <SearchInput
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder={t('loyaltyStore.search.placeholder')}
        aria-label={t('loyaltyStore.search.label')}
        className="max-w-xl"
      />
      <LiveStatus>{resultsStatus}</LiveStatus>
      <JumpsNote status={search.jumpsStatus} />

      {!hasQuery ? (
        search.heldStores.length > 0 ? (
          <Panel
            title={t('loyaltyStore.search.heldPanel')}
            meta={t('loyaltyStore.search.storeCount', { count: search.heldStores.length })}
          >
            <ul className="flex flex-col divide-y divide-line">
              {search.heldStores.map((store) => (
                <li key={store.corporationId} className="py-1.5">
                  <Link
                    to={lpStorePath(store.corporationId)}
                    className={entityLinkClassName('flex items-baseline justify-between gap-3')}
                  >
                    <span>{store.name}</span>
                    <span className="shrink-0 text-accent tabular-nums">
                      {t('loyaltyStore.pickerBalance', { lp: (store.lp ?? 0).toLocaleString() })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        ) : (
          <Panel>
            <EmptyState
              title={t('loyaltyStore.search.promptTitle')}
              hint={t('loyaltyStore.search.promptHint')}
            />
          </Panel>
        )
      ) : result.groups.length === 0 && result.corporations.length === 0 ? (
        search.status === 'loading' ? (
          <div className="flex justify-center p-6">
            <Spinner />
          </div>
        ) : search.status === 'unavailable' ? (
          <Panel>
            <EmptyState
              title={t('loyaltyStore.search.unavailableTitle')}
              hint={t('loyaltyStore.search.unavailableHint')}
            />
          </Panel>
        ) : (
          <Panel>
            <EmptyState
              title={t('loyaltyStore.search.noResultsTitle')}
              hint={t('loyaltyStore.search.noResultsHint')}
            />
          </Panel>
        )
      ) : (
        <>
          {result.corporations.length > 0 && (
            <Panel
              title={t('loyaltyStore.search.storesPanel')}
              meta={t('loyaltyStore.search.storeCount', { count: result.corporations.length })}
            >
              <ul className="flex flex-col divide-y divide-line">
                {result.corporations.map((corp) => (
                  <li key={corp.corporationId} className="py-1.5">
                    <Link
                      to={lpStorePath(corp.corporationId)}
                      state={{ from: 'lp-search', q: query } satisfies LpSearchCrumbState}
                      className={entityLinkClassName('block')}
                    >
                      <StoreCell store={corp} search={search} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {search.status === 'unavailable' && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('loyaltyStore.search.unavailableNote')}
            </p>
          )}
          {result.groups.map((group) => (
            <Panel
              key={group.typeId}
              title={group.name}
              meta={t('loyaltyStore.search.storeCount', { count: group.stores.length })}
              padded={false}
            >
              <DataTable
                label={group.name}
                columns={columns}
                rows={group.stores}
                rowKey={(store) => `${store.corporationId}:${store.offer.offer_id}`}
                density="compact"
                responsive="table"
                onRowClick={openStore}
              />
            </Panel>
          ))}
          {result.totalItemMatches > result.groups.length && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('loyaltyStore.search.moreItems', {
                shown: result.groups.length,
                total: result.totalItemMatches,
              })}
            </p>
          )}
        </>
      )}
    </div>
  );
}
