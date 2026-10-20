/**
 * Wallet's LP Store tab: one corporation's LP store (Wallet's Loyalty Points table links here by
 * `corporation_id`): every offer ranked by ISK/LP — profit divided by the LP
 * each offer costs, since LP (not ISK) is the resource a character can't
 * just make more of. A ranked list on the left, a full profit breakdown for
 * the selected offer on the right; on a phone the breakdown opens as a
 * bottom sheet instead of a second column. See
 * src/features/loyalty/useLoyaltyStoreOffers.ts for how the numbers are
 * assembled.
 *
 * The landing search opens any NPC corporation's store, LP or not; an open
 * store's "Change store" link returns to it (`/wallet/lp-store` with no
 * corporation is the landing state).
 */
import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useCallback, useDeferredValue, useMemo, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CorporationLink } from '@/features/entities/EntityLink';
import { industryTabHref } from '@/features/industry/industryTabs';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  Modal,
  Panel,
  PageHeader,
  LiveStatus,
  Spinner,
  StatChip,
  StatChips,
  TabPanel,
  useTabsId,
  CachedNotice,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useColumnVisibility } from '@/lib/columnVisibility';
import {
  LOYALTY_STORE_OFFERS_COLUMN_IDS,
  loyaltyStoreOffersColumnsStore,
} from '@/features/loyalty/loyaltyStoreColumns';
import { loyaltyOfferCsvColumns } from '@/features/loyalty/loyaltyStoreCsv';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { boolParam, optionalIdParam, textParam } from '@/lib/urlState';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { useMarketHub } from '@/features/market/hub';
import { usePriceBasis } from '@/features/loyalty/priceBasis';
import { useLpBasis } from '@/features/loyalty/lpBasis';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { useLoyaltyStoreOffers } from '@/features/loyalty/useLoyaltyStoreOffers';
import { useConcordRate } from '@/features/loyalty/useConcordRate';
import { useLoyaltyOfferColumns } from '@/features/loyalty/useLoyaltyOfferColumns';
import { LoyaltyOfferFilterBar } from '@/features/loyalty/LoyaltyOfferFilterBar';
import { OfferDetail } from '@/features/loyalty/OfferDetail';
import { resolveLoyaltyRowItem } from '@/features/loyalty/offerRowDisplay';
import { LoyaltyStoreLanding } from '@/features/loyalty/LoyaltyStoreLanding';
import { LpStoreActions, StoreCrumbs, WalletTabBar } from '@/features/loyalty/LpStoreChrome';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { applyBlueprintPriceSeed } from '@/features/industry/planSeed';
import { lpBlueprintPickPrice } from '@/features/industry/blueprintPurchaseOffers';

/** Module-level so the table's windowing and row memo see one stable function. */
const offerRowKey = (row: LoyaltyOfferRow) => row.offer.offer_id;

/**
 * The filter row's three fields, in the URL (ADR 0015, issue #1302): all
 * three as one `useUrlParams` group, so a click and a keystroke in the same
 * update write together. `affordableOnly` defaults `true` — the offer list's
 * own opening state — so it is the one omitted from the URL when left alone.
 */
const FILTER_PARAMS = {
  search: textParam(),
  affordableOnly: boolParam(true),
  blueprintsOnly: boolParam(false),
  /** The selected offer: a link (BPC Sourcing's LP rows) arrives with one already picked. */
  offer: optionalIdParam(),
};

const OFFERS_SORT = { columnId: 'iskPerLp', direction: 'desc' } as const;

/**
 * The route: `/wallet/lp-store` (landing) or `/wallet/lp-store/:corporationId`.
 * Keyed on the corporation so switching stores remounts the
 * page — no previous store's offers, selection or loaded state carried over
 * under the new store's URL.
 */
export function LoyaltyStore() {
  const { corporationId: corporationIdParam } = useParams<{ corporationId?: string }>();
  const corporationId = Number(corporationIdParam);
  if (corporationIdParam === undefined || !Number.isInteger(corporationId) || corporationId <= 0) {
    return <LoyaltyStoreLanding />;
  }
  return <LoyaltyStoreView key={corporationId} corporationId={corporationId} />;
}

function LoyaltyStoreView({ corporationId }: { corporationId: number }) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const tabsId = useTabsId();

  const hubId = useMarketHub((s) => s.value);
  const setHubId = useMarketHub((s) => s.setValue);
  useHydratedStore(useMarketHub, usePriceBasis, useLpBasis);

  const priceBasis = usePriceBasis((s) => s.value);
  const setPriceBasis = usePriceBasis((s) => s.setValue);
  const lpBasis = useLpBasis((s) => s.value);
  const setLpBasis = useLpBasis((s) => s.setValue);
  const { concord, concordPending } = useConcordRate(corporationId);

  const {
    corpName,
    offersFetchedAt,
    offersFromCache,
    offersError,
    reloadOffers,
    rows,
    catalog,
    catalogUnavailable,
    playerLp,
    hub,
    ready,
    pricesUnreachable,
    useOwnMaterialsFor,
    toggleUseOwnMaterials,
  } = useLoyaltyStoreOffers(corporationId);

  const offersColumnVisibility = useColumnVisibility(
    loyaltyStoreOffersColumnsStore,
    LOYALTY_STORE_OFFERS_COLUMN_IDS
  );

  const [filterParams, setFilterParams] = useUrlParams(FILTER_PARAMS);
  const { search, affordableOnly, blueprintsOnly } = filterParams;
  // Rows filter on a deferred copy so a keystroke paints the box first
  // (`useUrlFilter`'s rule); the search box keeps the immediate one.
  const rowsSearch = useDeferredValue(search);
  const selectedOfferId = filterParams.offer;
  // A phone arriving on a linked offer opens its breakdown straight away.
  const [sheetOpen, setSheetOpen] = useState(() => selectedOfferId !== null && !isDesktop);

  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  const itemActions = usePageItemActions({ activeCharacterId });

  const filteredRows = useMemo(() => {
    const q = rowsSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (affordableOnly && row.profit.affordableLp === false) return false;
      if (blueprintsOnly && !row.isBlueprint) return false;
      if (q && !row.itemName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, rowsSearch, affordableOnly, blueprintsOnly]);

  const affordableCount = useMemo(
    () => rows.filter((row) => row.profit.affordableLp !== false).length,
    [rows]
  );

  // No fallback to "the top row" here: `DataTable` sorts its own displayed
  // copy independently of `filteredRows`' order, so a fallback tied to this
  // array's order can point at a row that no longer reads as "first" once
  // the table itself is sorted differently. The prompt below stands until an
  // explicit click picks a row.
  const selectedRow = filteredRows.find((row) => row.offer.offer_id === selectedOfferId);

  function selectRow(row: LoyaltyOfferRow) {
    setFilterParams({ offer: row.offer.offer_id });
    if (!isDesktop) setSheetOpen(true);
  }

  /**
   * Opens the product's Build Plan with this redemption as its Blueprint
   * Acquisition — the pilot is in the LP Store looking at it, so that is
   * where the blueprint comes from. A redemption that can't be priced (a
   * turn-in with no hub price) opens the plan unseeded, to price itself.
   */
  async function planInIndustry(row: LoyaltyOfferRow) {
    if (row.productTypeId === null) return;
    const params = new URLSearchParams({ product: String(row.productTypeId) });
    applyBlueprintPriceSeed(
      params,
      await lpBlueprintPickPrice(row.offer, corporationId, getTradeHub(hubId) ?? DEFAULT_TRADE_HUB)
    );
    navigate(`${industryTabHref('plans')}?${params.toString()}`);
  }

  // Stable, so the offers table's memoized rows skip re-rendering on every page render.
  const rowContextMenu = useCallback(
    (row: LoyaltyOfferRow, tr: ReactElement) => {
      const { typeId, itemName } = resolveLoyaltyRowItem(row);
      if (typeId === null) return tr;
      // `catalog` is always resolved by the time a row exists to right-click —
      // `useLoyaltyStoreOffers` gates `ready` on `catalog !== null` — so this
      // never needs the lazy-load `onOpenChange` wiring the Market/Assets menus
      // use; `?? null` collapsing "not loaded" into "no blueprint" is safe here.
      const blueprintTypeID = catalog?.byProductTypeID.get(typeId)?.blueprintTypeID ?? null;
      return (
        <ItemContextMenu typeId={typeId} itemName={itemName} blueprintTypeID={blueprintTypeID}>
          {tr}
        </ItemContextMenu>
      );
    },
    [catalog]
  );
  // `DataTable` draws the selected row itself from `selectedRowKey`; it keys on the
  // selected id rather than `selectedRow`, so a selected offer filtered out of
  // `filteredRows` simply has no row to mark.

  const { columns, optionalColumns: optionalOfferColumns } = useLoyaltyOfferColumns({
    lpBasis,
    concord,
    concordPending,
    isColumnVisible: offersColumnVisibility.isVisible,
  });
  // The full catalog, not just `columns`' currently-visible ids: a sort
  // picked while a column was shown should still resolve once the picker
  // hides it, ready to take effect again the moment it's shown back
  // (`resolveSort` only rejects a `columnId` the catalog has never heard of).
  const offersSortProps = useUrlSort('sort', OFFERS_SORT, [
    'item',
    ...LOYALTY_STORE_OFFERS_COLUMN_IDS,
  ]);
  // Every column, whatever the picker hides.
  const offersCsvColumns = useMemo(() => loyaltyOfferCsvColumns(t), [t]);
  const offersExport = useTableExport({
    surface: 'lp-offers',
    rows: filteredRows,
    columns: offersCsvColumns,
    qualifier: corpName ?? undefined,
  });

  const list = (
    <Panel
      title={t('loyaltyStore.title')}
      wrapMeta
      meta={
        ready && (
          <span className="flex min-w-0 items-center gap-2 text-[0.6875rem] text-text-dim max-md:basis-full">
            <LiveStatus>
              {filteredRows.length} / {t('loyaltyStore.offerCount', { count: rows.length })}
            </LiveStatus>
            <span aria-hidden="true" className="hidden text-xs tabular-nums md:inline">
              {filteredRows.length} / {t('loyaltyStore.offerCount', { count: rows.length })}
            </span>
            <span data-testid="lp-basis-readout" className="min-w-0 truncate">
              {[
                (getTradeHub(hubId) ?? DEFAULT_TRADE_HUB).systemName,
                t(
                  priceBasis === 'buy'
                    ? 'loyaltyStore.priceBasisBuyShort'
                    : 'loyaltyStore.priceBasisSellShort'
                ),
                ...(lpBasis === 'concord' ? [t('loyaltyStore.lpBasisConcord')] : []),
              ].join(' · ')}
            </span>
          </span>
        )
      }
      actions={
        ready &&
        filteredRows.length > 0 && (
          <TableActionsMenu name={t('loyaltyStore.title')} tableExport={offersExport} />
        )
      }
      padded={false}
      className={isDesktop ? 'w-80 shrink-0 xl:w-[28rem]' : undefined}
    >
      {offersError ? (
        <EmptyState
          title={t('loyaltyStore.errorTitle')}
          hint={t('loyaltyStore.errorHint')}
          action={
            <Button size="sm" onClick={reloadOffers}>
              {t('loyaltyStore.retry')}
            </Button>
          }
        />
      ) : !ready ? (
        <div className="flex justify-center p-6">
          <Spinner />
        </div>
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? t('loyaltyStore.emptyTitle') : t('loyaltyStore.noMatchTitle')}
          hint={rows.length === 0 ? t('loyaltyStore.emptyHint') : t('loyaltyStore.noMatchHint')}
          action={
            rows.length > 0 && (search.trim() !== '' || affordableOnly || blueprintsOnly) ? (
              <Button
                size="sm"
                onClick={() =>
                  setFilterParams({ search: '', affordableOnly: false, blueprintsOnly: false })
                }
              >
                {t('common.resetFilters')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {catalogUnavailable && (
            <p className="border-b border-line px-3 py-1.5 text-[0.6875rem] text-text-dim">
              {t('loyaltyStore.catalogUnavailable')}
            </p>
          )}
          {pricesUnreachable && (
            <p
              role="status"
              className="border-b border-line px-3 py-1.5 text-[0.6875rem] text-text-dim"
            >
              {pricesUnavailableLabel}
            </p>
          )}
          {lpBasis === 'concord' && !concordPending && (
            <p className="border-b border-line px-3 py-1.5 text-[0.6875rem] text-text-dim">
              {concord
                ? t(
                    concord.basis === 'assumed'
                      ? 'loyaltyStore.concordRateAssumed'
                      : 'loyaltyStore.concordRateVerified',
                    { rate: concord.rate }
                  )
                : t('loyaltyStore.noConcordExchangeNote')}{' '}
              {t('loyaltyStore.concordExchangeHelp')}
            </p>
          )}
          {priceBasis === 'sell' && (
            <AssumesBaseStandingsNote
              className="border-b border-line px-3"
              hint={t('loyaltyStore.assumesBaseStandingsHint')}
            />
          )}
          <DataTable
            {...offersExport.tableProps}
            label={t('loyaltyStore.title')}
            columns={columns}
            rows={filteredRows}
            rowKey={offerRowKey}
            density="compact"
            virtualize="auto"
            sort={offersSortProps.sort}
            onSortChange={offersSortProps.onSortChange}
            mobileSort
            stackSummary={t('loyaltyStore.offerCount', { count: filteredRows.length })}
            onRowClick={selectRow}
            rowContextMenu={rowContextMenu}
            rowMoreActions
            selectedRowKey={selectedOfferId}
          />
        </>
      )}
    </Panel>
  );

  const detail = selectedRow ? (
    <OfferDetail
      row={selectedRow}
      catalog={catalog}
      hubId={hub.id}
      hubName={hub.name}
      priceBasis={priceBasis}
      lpBasis={lpBasis}
      concord={concord}
      concordPending={concordPending}
      playerLp={playerLp}
      useOwnMaterials={useOwnMaterialsFor.has(selectedRow.offer.offer_id)}
      onToggleUseOwnMaterials={() => toggleUseOwnMaterials(selectedRow.offer.offer_id)}
      onPlanInIndustry={planInIndustry}
    />
  ) : (
    <p className="p-4 text-xs text-text-dim">{t('loyaltyStore.selectPrompt')}</p>
  );

  return (
    <ItemActionsProvider page={itemActions}>
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <StoreCrumbs />
        <PageHeader
          title={corpName ?? t('loyaltyStore.title')}
          meta={
            <div className="flex flex-wrap items-center gap-2">
              {offersFetchedAt && <DataAgeBadge date={offersFetchedAt} />}
              <CorporationLink id={corporationId} className="text-xs">
                {t('loyaltyStore.corporationInfo')}
              </CorporationLink>
              <StatChips>
                <StatChip
                  label={t('loyaltyStore.yourLp')}
                  value={playerLp === null ? '—' : playerLp.toLocaleString()}
                  tone="accent"
                  emphasis
                />
              </StatChips>
            </div>
          }
          actions={<LpStoreActions />}
        />
        <WalletTabBar tabsId={tabsId} />

        <TabPanel tabsId={tabsId} tabId="lp-store" className="flex flex-col gap-3">
          <LoyaltyOfferFilterBar
            value={{ hubId, priceBasis, lpBasis, affordableOnly, blueprintsOnly }}
            onChange={(next) => {
              // Persisted preferences (hub, price basis) are written here and only
              // here, so a Cancel in the mobile sheet never has a store write to
              // roll back — the draft was local until this point.
              if (next.hubId !== hubId) void setHubId(next.hubId);
              if (next.priceBasis !== priceBasis) void setPriceBasis(next.priceBasis);
              if (next.lpBasis !== lpBasis) void setLpBasis(next.lpBasis);
              setFilterParams({
                affordableOnly: next.affordableOnly,
                blueprintsOnly: next.blueprintsOnly,
              });
            }}
            search={search}
            onSearchChange={(value) => setFilterParams({ search: value })}
            affordableCount={affordableCount}
            columnVisibility={offersColumnVisibility}
            columnsById={optionalOfferColumns}
          />

          {offersFromCache && <CachedNotice fetchedAt={offersFetchedAt} />}

          {isDesktop ? (
            <div className="flex items-start gap-3">
              {list}
              {/* The mobile branch below opens the same content in a `Modal`,
              which announces itself on open — this split-panel layout just
              repaints in place, so it needs its own announcement (#1490). */}
              <p aria-live="polite" className="sr-only">
                {selectedRow &&
                  t('loyaltyStore.selectedAnnouncement', { name: selectedRow.itemName })}
              </p>
              <Panel className="min-w-0 flex-1">{detail}</Panel>
            </div>
          ) : (
            <>
              {list}
              <Modal
                open={sheetOpen && selectedRow !== undefined}
                onClose={() => setSheetOpen(false)}
                title={selectedRow?.itemName ?? t('loyaltyStore.title')}
                placement="sheet"
              >
                {detail}
              </Modal>
            </>
          )}
        </TabPanel>
      </div>
    </ItemActionsProvider>
  );
}
