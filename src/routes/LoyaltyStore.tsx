import { usePricesUnavailableLabel } from '@/features/market/usePricesUnavailableLabel';
import { useHydratedStore } from '@/lib/useHydratedStore';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { industryTabHref } from '@/features/industry/industryTabs';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  Modal,
  Panel,
  LiveStatus,
  Spinner,
  StatChip,
  StatChips,
  CachedNotice,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useIsPhone } from '@/lib/useIsPhone';
import { useColumnVisibility } from '@/lib/columnVisibility';
import {
  LOYALTY_STORE_OFFERS_COLUMN_IDS,
  loyaltyStoreOffersColumnsStore,
} from '@/features/loyalty/loyaltyStoreColumns';
import { loyaltyOfferCsvColumns } from '@/features/loyalty/loyaltyStoreCsv';
import { useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { boolParam, optionalBoolParam, optionalIdParam, textParam } from '@/lib/urlState';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { pickHubFor, useHubFor } from '@/features/market/hub';
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
import { NearestStationLine } from '@/features/loyalty/NearestStationLine';
import { LpStoreActions } from '@/features/loyalty/LpStoreChrome';
import { SpendLpButton, SpendPlanPanel } from '@/features/loyalty/SpendPlan';
import { hasSpendCandidates, useSpendPlan } from '@/features/loyalty/useSpendPlan';
import type { LpSearchCrumbState } from '@/features/loyalty/lpStorePath';
import type { LoyaltyOfferRow } from '@/features/loyalty/offerRows';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { applyBlueprintPriceSeed } from '@/features/industry/planSeed';
import { lpBlueprintPickPrice } from '@/features/industry/blueprintPurchaseOffers';
import { formatNumber } from '@/lib/numberLocale';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import type { EsiEndpointId } from '@/esi/registry';

const offerRowKey = (row: LoyaltyOfferRow) => row.offer.offer_id;
const LOYALTY_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterLoyaltyPoints'];

const FILTER_PARAMS = {
  search: textParam(),
  affordableOnly: optionalBoolParam(),
  blueprintsOnly: boolParam(false),
  offer: optionalIdParam(),
};

const OFFERS_SORT = { columnId: 'iskPerLp', direction: 'desc' } as const;

export function LoyaltyStore() {
  const { corporationId: corporationIdParam } = useParams<{ corporationId?: string }>();
  const corporationId = Number(corporationIdParam);
  const valid =
    corporationIdParam !== undefined && Number.isInteger(corporationId) && corporationId > 0;
  return (
    <>
      <LoyaltyStoreLanding active={!valid} />
      {valid && <LoyaltyStoreView key={corporationId} corporationId={corporationId} />}
    </>
  );
}

function LoyaltyStoreView({ corporationId }: { corporationId: number }) {
  const { t } = useTranslation();
  const pricesUnavailableLabel = usePricesUnavailableLabel();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const isPhone = useIsPhone();
  const location = useLocation();
  const [arrivedState] = useState(() => location.state as Partial<LpSearchCrumbState> | null);

  const { hubId } = useHubFor('lpStore');
  useHydratedStore(usePriceBasis, useLpBasis);

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
    instantIskPerLp,
    catalog,
    catalogUnavailable,
    playerLp,
    hub,
    ready,
    pricesUnreachable,
    useOwnMaterialsFor,
    toggleUseOwnMaterials,
    skills,
    standing,
    ownedStockSnapshot,
  } = useLoyaltyStoreOffers(corporationId);

  const offersColumnVisibility = useColumnVisibility(
    loyaltyStoreOffersColumnsStore,
    LOYALTY_STORE_OFFERS_COLUMN_IDS
  );

  const [filterParams, setFilterParams] = useUrlParams(FILTER_PARAMS);
  const { search, blueprintsOnly } = filterParams;
  const defaultAffordableOnly = playerLp !== 0;
  const affordableOnly = filterParams.affordableOnly ?? defaultAffordableOnly;
  const affordableParam = (next: boolean) => (next === defaultAffordableOnly ? null : next);
  const rowsSearch = useDeferredValue(search);
  const selectedOfferId = filterParams.offer;
  const [arrivedOfferId] = useState(selectedOfferId);
  const [sheetOpen, setSheetOpen] = useState(() => selectedOfferId !== null && !isDesktop);

  const activeCharacterId = useActiveCharacter((s) => s.activeCharacterId);
  const lacksLoyaltyScope = useCharacterLacksEndpoints(activeCharacterId, LOYALTY_ENDPOINTS);
  const itemActions = usePageItemActions({ activeCharacterId });

  const filteredRows = useMemo(() => {
    const q = rowsSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (row.offer.offer_id === arrivedOfferId && row.offer.offer_id === selectedOfferId)
        return true;
      if (affordableOnly && row.profit.affordableLp === false) return false;
      if (blueprintsOnly && !row.isBlueprint) return false;
      if (q && !row.itemName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, rowsSearch, affordableOnly, blueprintsOnly, selectedOfferId, arrivedOfferId]);

  const spendPlan = useSpendPlan({
    corporationId,
    rows: filteredRows,
    instantIskPerLp,
    catalog,
    hub,
    skills,
    standing,
    playerLp,
    ownedStock: ownedStockSnapshot,
    activeCharacterId,
  });

  const affordableCount = useMemo(
    () => rows.filter((row) => row.profit.affordableLp !== false).length,
    [rows]
  );

  const selectedRow = filteredRows.find((row) => row.offer.offer_id === selectedOfferId);

  const arrivedRowPresent = rows.some((row) => row.offer.offer_id === arrivedOfferId);
  useEffect(() => {
    if (arrivedOfferId === null || !arrivedRowPresent) return;
    document
      .querySelector(`[data-row-key="${arrivedOfferId}"]`)
      ?.scrollIntoView?.({ block: 'center' });
  }, [arrivedOfferId, arrivedRowPresent]);

  function selectRow(row: LoyaltyOfferRow) {
    setFilterParams({ offer: row.offer.offer_id });
    if (!isDesktop) setSheetOpen(true);
  }

  async function planInIndustry(row: LoyaltyOfferRow) {
    if (row.productTypeId === null) return;
    const params = new URLSearchParams({ product: String(row.productTypeId) });
    applyBlueprintPriceSeed(
      params,
      await lpBlueprintPickPrice(row.offer, getTradeHub(hubId) ?? DEFAULT_TRADE_HUB)
    );
    navigate(`${industryTabHref('plans')}?${params.toString()}`);
  }

  const rowContextMenu = useCallback(
    (row: LoyaltyOfferRow, tr: ReactElement) => {
      const { typeId, itemName } = resolveLoyaltyRowItem(row);
      if (typeId === null) return tr;
      const blueprintTypeID = catalog?.byProductTypeID.get(typeId)?.blueprintTypeID ?? null;
      return (
        <ItemContextMenu typeId={typeId} itemName={itemName} blueprintTypeID={blueprintTypeID}>
          {tr}
        </ItemContextMenu>
      );
    },
    [catalog]
  );

  const offersSortProps = useUrlSort('sort', OFFERS_SORT, [
    'item',
    ...LOYALTY_STORE_OFFERS_COLUMN_IDS,
  ]);
  const { columns, optionalColumns: optionalOfferColumns } = useLoyaltyOfferColumns({
    lpBasis,
    concord,
    concordPending,
    isColumnVisible: offersColumnVisibility.isVisible,
    playerLp,
    sortColumnId: offersSortProps.sort?.columnId,
  });
  const offersCsvColumns = useMemo(
    () => loyaltyOfferCsvColumns(t, { concordRate: concord?.rate ?? null }),
    [t, concord]
  );
  const offersExport = useTableExport({
    surface: 'lp-offers',
    rows: filteredRows,
    columns: offersCsvColumns,
    qualifier: corpName ?? undefined,
  });

  function closeStore() {
    const search = arrivedState?.from === 'lp-search' ? arrivedState.search : undefined;
    navigate(`/wallet/lp-store${search?.startsWith('?') ? search : ''}`, { replace: true });
  }

  const list = (
    <Panel
      title={isPhone ? undefined : t('loyaltyStore.title')}
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
          <span className="flex items-center gap-2">
            <SpendLpButton
              playerLp={playerLp}
              lpAccess={
                activeCharacterId === null ? 'signedOut' : lacksLoyaltyScope ? 'noScope' : null
              }
              rankable={hasSpendCandidates(filteredRows, instantIskPerLp)}
              loading={spendPlan.plan.status === 'loading'}
              onClick={spendPlan.run}
            />
            <TableActionsMenu name={t('loyaltyStore.title')} tableExport={offersExport} />
          </span>
        )
      }
      padded={false}
      className={isDesktop ? 'w-[28rem] shrink-0' : undefined}
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
                  setFilterParams({
                    search: '',
                    affordableOnly: affordableParam(false),
                    blueprintsOnly: false,
                  })
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
            stackLayout="dense"
            className="dt-actions-pinned-only"
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
      key={selectedRow.offer.offer_id}
      row={selectedRow}
      hub={hub}
      skills={skills}
      standing={standing}
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
      <Modal
        open
        onClose={closeStore}
        closeOnBack={false}
        placement="page"
        title={corpName ?? t('loyaltyStore.title')}
        titleActions={
          <div className="flex shrink-0 items-center gap-2">
            {offersFetchedAt && <DataAgeBadge date={offersFetchedAt} />}
            <StatChips>
              <StatChip
                label={t('loyaltyStore.yourLp')}
                value={playerLp === null ? '—' : formatNumber(playerLp)}
                emphasis
              />
            </StatChips>
            <LpStoreActions />
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <NearestStationLine corporationId={corporationId} />
          <div className="max-sm:sticky max-sm:-top-3 max-sm:z-10 max-sm:-mx-3 max-sm:bg-panel max-sm:px-3 max-sm:py-1.5">
            <LoyaltyOfferFilterBar
              value={{ hubId, priceBasis, lpBasis, affordableOnly, blueprintsOnly }}
              onChange={(next) => {
                if (next.hubId !== hubId) void pickHubFor('lpStore', next.hubId);
                if (next.priceBasis !== priceBasis) void setPriceBasis(next.priceBasis);
                if (next.lpBasis !== lpBasis) void setLpBasis(next.lpBasis);
                setFilterParams({
                  ...(next.affordableOnly !== affordableOnly && {
                    affordableOnly: affordableParam(next.affordableOnly),
                  }),
                  blueprintsOnly: next.blueprintsOnly,
                });
              }}
              search={search}
              onSearchChange={(value) => setFilterParams({ search: value })}
              affordableCount={affordableCount}
              columnVisibility={offersColumnVisibility}
              columnsById={optionalOfferColumns}
            />
          </div>

          {offersFromCache && <CachedNotice withBadge fetchedAt={offersFetchedAt} />}

          {spendPlan.open && (
            <SpendPlanPanel
              plan={spendPlan.plan}
              playerLp={playerLp}
              onSelectOffer={selectRow}
              onClose={spendPlan.close}
            />
          )}

          {isDesktop ? (
            <div className="flex items-start gap-3">
              {list}
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
        </div>
      </Modal>
    </ItemActionsProvider>
  );
}
