import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  IskAmount,
  LiveStatus,
  PageHeader,
  Panel,
  Spinner,
  StatChip,
  StatChips,
  TabPanel,
  useTabsId,
} from '@/components/ui';
import { LpStoreActions, WalletTabBar } from '@/features/loyalty/LpStoreChrome';
import { useMarketHub } from '@/features/market/hub';
import { JUMP_RANGES } from '@/engine/route/jumpRange';
import { formatAge, MINUTE_MS } from '@/lib/age';
import { useTicker } from '@/lib/ticker';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { formatCount } from '@/lib/formatCount';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useUrlFilter, useUrlParams, useUrlSort } from '@/lib/useUrlState';
import {
  boolParam,
  defineUrlFilter,
  enumParam,
  idListParam,
  textParam,
  type UrlParamCodec,
} from '@/lib/urlState';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';

import {
  LP_LANDING_OFFER_COLUMN_IDS,
  LP_LANDING_OFFER_PHONE_OFF,
  LP_LANDING_STORE_COLUMN_IDS,
  LP_LANDING_STORE_DEFAULT_COLUMNS,
  LP_LANDING_STORE_PHONE_OFF,
  lpLandingOfferColumnsStore,
  lpLandingStoreColumnsStore,
} from './loyaltyStoreColumns';
import {
  DEFAULT_LP_LANDING_FILTERS,
  MIN_SELLS_PER_DAY_OPTIONS,
  lpLandingHoldings,
  lpLandingOffers,
  lpLandingStores,
  type LpLandingFilters,
  type LpLandingOffer,
  type LpLandingStore,
  type MinSellsPerDay,
} from './lpLanding';
import {
  LpLandingFilterBar,
  type LpLandingFilterValue,
  type LpLandingView,
} from './LpLandingFilterBar';
import { lpStorePath, type LpSearchCrumbState } from './lpStorePath';
import { useLpValue } from './lpValue';
import { usePriceBasis } from './priceBasis';
import { useLpLandingOfferColumns, useLpLandingStoreColumns } from './useLpLandingColumns';
import { useLpStoreLanding } from './useLpStoreLanding';

/** `all`, `none` or a faction id. */
function factionParam(): UrlParamCodec<LpLandingFilters['faction']> {
  return {
    parse: (raw) => {
      if (raw === 'none') return 'none';
      const id = Number(raw);
      return raw !== null && Number.isInteger(id) && id > 0 ? id : 'all';
    },
    serialize: (value) => (value === 'all' ? null : String(value)),
  };
}

function minSellsParam(): UrlParamCodec<MinSellsPerDay> {
  const fallback = DEFAULT_LP_LANDING_FILTERS.minSellsPerDay;
  return {
    parse: (raw) => MIN_SELLS_PER_DAY_OPTIONS.find((n) => String(n) === raw) ?? fallback,
    serialize: (value) => (value === fallback ? null : String(value)),
  };
}

/** The view and search box, in the URL (ADR 0015), so a view can be linked and Back returns to it. */
const VIEW_PARAMS = {
  view: enumParam<LpLandingView>(['stores', 'offers'], 'stores'),
  q: textParam(),
};

/** Every filter in the URL too; hub and price basis are app-wide settings instead. */
const FILTER = defineUrlFilter<LpLandingFilters>({
  faction: { key: 'faction', codec: factionParam() },
  range: { key: 'range', codec: enumParam(JUMP_RANGES, DEFAULT_LP_LANDING_FILTERS.range) },
  minSellsPerDay: { key: 'minSells', codec: minSellsParam() },
  mineOnly: { key: 'mine', codec: boolParam() },
  hideFactionWarfare: { key: 'noFw', codec: boolParam() },
  noTurnIns: { key: 'noTurnIns', codec: boolParam() },
  affordableOnly: { key: 'affordable', codec: boolParam() },
  categories: { key: 'cat', codec: idListParam() },
});

const STORES_SORT = { columnId: 'lpValue', direction: 'desc' } as const;
const OFFERS_SORT = { columnId: 'iskPerLp', direction: 'desc' } as const;
const STORE_SORT_IDS = ['store', 'lpValue', ...LP_LANDING_STORE_COLUMN_IDS];
const OFFER_SORT_IDS = ['item', 'iskPerLp', ...LP_LANDING_OFFER_COLUMN_IDS];

const storeRowKey = (store: LpLandingStore) => store.corporationId;
// Stores share offer ids (one navy offer runs in several corporations' stores).
const offerRowKey = (offer: LpLandingOffer) =>
  `${offer.store.corporationId}:${offer.row.offer.offer_id}`;

/**
 * `/wallet/lp-store` with no store open: every LP Store ranked by LP Value
 * (Stores) or every offer ranked by ISK/LP (Offers), under one search box and
 * one filter set (`lpLanding.ts`). A row opens that store's modal over this
 * page, on the offer for an Offers row. `active` false while that modal is
 * open: nothing behind it is priced (`useLpStoreLanding`).
 */
export function LoyaltyStoreLanding({ active = true }: { active?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const tabsId = useTabsId();
  const [params, setParams] = useUrlParams(VIEW_PARAMS);
  const [filters, setFilters] = useUrlFilter<LpLandingFilters>(
    'lp-landing',
    FILTER.schema,
    FILTER.fieldToParam,
    FILTER.emptyParams
  );
  const data = useLpStoreLanding(active);
  const now = useTicker(MINUTE_MS);

  const hubId = useMarketHub((s) => s.value);
  const setHubId = useMarketHub((s) => s.setValue);
  const priceBasis = usePriceBasis((s) => s.value);
  const setPriceBasis = usePriceBasis((s) => s.setValue);
  const ownLpValue = useLpValue((s) => s.value);
  useHydratedStore(useMarketHub, usePriceBasis, useLpValue);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const view = params.view;
  const query = params.q;
  const filterValue: LpLandingFilterValue = { ...filters, hubId, priceBasis };
  function onFilterChange(next: LpLandingFilterValue) {
    // Hub and basis are the app-wide settings, written where they are edited and nowhere else.
    if (next.hubId !== hubId) void setHubId(next.hubId);
    if (next.priceBasis !== priceBasis) void setPriceBasis(next.priceBasis);
    // Only the filter's own fields reach the URL.
    setFilters(next);
  }

  const shownStores = useMemo(
    () => lpLandingStores(data.stores, data.offers, filters, query),
    [data.stores, data.offers, filters, query]
  );
  const shownOffers = useMemo(
    () => (view === 'offers' ? lpLandingOffers(data.offers, filters, query) : []),
    [view, data.offers, filters, query]
  );
  const holdings = useMemo(
    () => lpLandingHoldings(data.stores, ownLpValue),
    [data.stores, ownLpValue]
  );

  const storeColumns = useLpLandingStoreColumns({
    systemName: data.systemName,
    factionName: data.factionName,
    distancesKnown: data.jumpsStatus === 'ready',
    pricing: data.pricing,
    valuing: data.valuing,
    ownLpValue,
  });
  const offerColumns = useLpLandingOfferColumns({ systemName: data.systemName });
  const storeVisibility = useColumnVisibility(
    lpLandingStoreColumnsStore,
    LP_LANDING_STORE_DEFAULT_COLUMNS,
    LP_LANDING_STORE_PHONE_OFF
  );
  const offerVisibility = useColumnVisibility(
    lpLandingOfferColumnsStore,
    LP_LANDING_OFFER_COLUMN_IDS,
    LP_LANDING_OFFER_PHONE_OFF
  );
  const storeSort = useUrlSort('storeSort', STORES_SORT, STORE_SORT_IDS);
  const offerSort = useUrlSort('offerSort', OFFERS_SORT, OFFER_SORT_IDS);

  // The whole landing URL rides along, so Close after a reload rebuilds this view, not just the query.
  const crumb: LpSearchCrumbState = { from: 'lp-search', q: query, search: location.search };
  const openStore = (store: LpLandingStore) =>
    navigate(lpStorePath(store.corporationId), { state: crumb });
  const openOffer = (offer: LpLandingOffer) =>
    navigate(lpStorePath(offer.store.corporationId, offer.row.offer.offer_id), { state: crumb });

  const columnPicker =
    view === 'stores' ? (
      <ColumnPickerMenu
        available={LP_LANDING_STORE_COLUMN_IDS}
        visible={storeVisibility.visible}
        columnsById={storeColumns.optional}
        onToggle={storeVisibility.toggle}
        buttonLabel={t('common.columnsButton')}
        menuTitle={t('common.columnsMenuTitle')}
        onReset={storeVisibility.reset}
        resetLabel={t('common.resetColumns')}
      />
    ) : (
      <ColumnPickerMenu
        available={LP_LANDING_OFFER_COLUMN_IDS}
        visible={offerVisibility.visible}
        columnsById={offerColumns.optional}
        onToggle={offerVisibility.toggle}
        buttonLabel={t('common.columnsButton')}
        menuTitle={t('common.columnsMenuTitle')}
        onReset={offerVisibility.reset}
        resetLabel={t('common.resetColumns')}
      />
    );

  const shown = view === 'stores' ? shownStores.length : shownOffers.length;
  const total = view === 'stores' ? data.stores.length : data.offers.length;
  const offersPending = view === 'offers' && data.pricing;
  // A linked "I can afford" / "Stores I hold LP with" waits for the balances, not "Nothing matches".
  const balancesPending = (filters.mineOnly || filters.affordableOnly) && !data.balancesKnown;

  let body;
  if (data.status === 'loading' || offersPending || balancesPending) {
    body = (
      <div className="flex flex-col items-center gap-2 p-6 text-xs text-text-dim">
        <Spinner />
        {offersPending && <span>{t('loyaltyStore.landing.pricing')}</span>}
      </div>
    );
  } else if (data.status === 'unavailable') {
    body = (
      <EmptyState
        title={t('loyaltyStore.landing.unavailableTitle')}
        hint={t('loyaltyStore.landing.unavailableHint')}
      />
    );
  } else if (shown === 0) {
    body = (
      <EmptyState
        title={t('loyaltyStore.landing.noResultsTitle')}
        hint={t('loyaltyStore.landing.noResultsHint')}
      />
    );
  } else if (view === 'stores') {
    body = (
      <DataTable
        label={t('loyaltyStore.landing.tableStores')}
        columns={[
          ...storeColumns.fixed,
          ...LP_LANDING_STORE_COLUMN_IDS.filter((id) => storeVisibility.visible.includes(id)).map(
            (id) => storeColumns.optional[id]
          ),
        ]}
        rows={shownStores}
        rowKey={storeRowKey}
        sort={storeSort.sort}
        onSortChange={storeSort.onSortChange}
        onRowClick={openStore}
        stackLayout="dense"
        mobileSort
        stackSummary={t('loyaltyStore.landing.resultsStatusStores', { count: shown })}
        virtualize="auto"
      />
    );
  } else {
    body = (
      <DataTable
        label={t('loyaltyStore.landing.tableOffers')}
        columns={[
          offerColumns.fixed[0],
          ...LP_LANDING_OFFER_COLUMN_IDS.filter((id) => offerVisibility.visible.includes(id)).map(
            (id) => offerColumns.optional[id]
          ),
          offerColumns.fixed[1],
        ]}
        rows={shownOffers}
        rowKey={offerRowKey}
        sort={offerSort.sort}
        onSortChange={offerSort.onSortChange}
        onRowClick={openOffer}
        stackLayout="dense"
        mobileSort
        stackSummary={t('loyaltyStore.landing.resultsStatusOffers', { count: shown })}
        virtualize="auto"
      />
    );
  }

  return (
    <div className="mx-auto flex max-w-page flex-col gap-3">
      <PageHeader title={t('loyaltyStore.title')} actions={<LpStoreActions />} />
      <WalletTabBar tabsId={tabsId} />
      <TabPanel tabsId={tabsId} tabId="lp-store">
        <div className="flex flex-col gap-3">
          {holdings && (
            <StatChips>
              <StatChip
                label={t('loyaltyStore.landing.holdingsLp')}
                value={t('loyaltyStore.landing.holdingsLpValue', {
                  lp: formatCount(holdings.lp),
                  count: holdings.stores,
                })}
              />
              <StatChip
                label={t('loyaltyStore.landing.holdingsWorth')}
                value={
                  data.valuing ? (
                    '…'
                  ) : (
                    <>
                      <IskAmount value={holdings.worth} decimals={0} />
                      {holdings.unpriced > 0 && (
                        <span className="ml-1.5 text-[0.6875rem] font-normal text-text-dim">
                          {t('loyaltyStore.landing.holdingsUnpriced', {
                            count: holdings.unpriced,
                          })}
                        </span>
                      )}
                    </>
                  )
                }
                tooltip={t('loyaltyStore.landing.holdingsWorthHelp', { hub: hub.systemName })}
                emphasis
              />
              {holdings.best && (
                <StatChip
                  label={t('loyaltyStore.landing.holdingsBest')}
                  value={t('loyaltyStore.landing.holdingsBestValue', {
                    store: holdings.best.name,
                    value: formatCount(Math.round(holdings.best.lpValue!)),
                  })}
                />
              )}
            </StatChips>
          )}
          <LpLandingFilterBar
            view={view}
            onViewChange={(next) => setParams({ view: next })}
            query={query}
            onQueryChange={(q) => setParams({ q })}
            value={filterValue}
            onChange={onFilterChange}
            factions={data.factions}
            categories={data.categories}
            heldStores={data.balancesKnown ? (holdings?.stores ?? 0) : null}
            columnPicker={columnPicker}
          />
          <LiveStatus>
            {data.status === 'ready' && !offersPending
              ? t(
                  view === 'stores'
                    ? 'loyaltyStore.landing.resultsStatusStores'
                    : 'loyaltyStore.landing.resultsStatusOffers',
                  { count: shown }
                )
              : null}
          </LiveStatus>
          {data.status === 'ready' && (
            <p className="text-[0.6875rem] text-text-dim">
              {[
                t('loyaltyStore.landing.scope', {
                  hub: hub.systemName,
                  basis: t(
                    priceBasis === 'buy'
                      ? 'loyaltyStore.landing.scopeBasisBuy'
                      : 'loyaltyStore.landing.scopeBasisSell'
                  ),
                  age: data.syncedAt === null ? '—' : formatAge(now - data.syncedAt, t),
                }),
                offersPending
                  ? null
                  : t(
                      view === 'stores'
                        ? 'loyaltyStore.landing.shownStores'
                        : 'loyaltyStore.landing.shownOffers',
                      { shown: formatCount(shown), total: formatCount(total) }
                    ),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {(data.jumpsStatus === 'no-origin' || data.jumpsStatus === 'unknown') && (
            <p className="text-[0.6875rem] text-text-dim">
              {t(
                data.jumpsStatus === 'no-origin'
                  ? 'loyaltyStore.landing.noOrigin'
                  : 'loyaltyStore.landing.noGraph'
              )}
            </p>
          )}
          {/* Sideways scroll, not a clipped last column, where the table is wider than the page (768px). */}
          <Panel padded={false}>
            <div className="overflow-x-auto">{body}</div>
          </Panel>
        </div>
      </TabPanel>
    </div>
  );
}
