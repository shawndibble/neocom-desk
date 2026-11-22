import { FromWalletCrumb } from '@/features/netWorth/FromWalletCrumb';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { named, preloadFrom } from '@/app/routeChunks';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { usePageTab } from '@/lib/usePageTab';
import { MARKET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { HaulingPanel, type HaulingRefreshInfo } from '@/features/market/HaulingPanel';
import {
  Button,
  DataAgeBadge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  FilterChip,
  IconButton,
  LiveNote,
  LiveStatus,
  PageHeader,
  Panel,
  RegionSelect,
  SearchInput,
  Spinner,
  TabPanel,
  Tabs,
  Toast,
  useOpenAfterMenu,
  useTabsId,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { industryTabHref } from '@/features/industry/industryTabs';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { useOnline } from '@/stores/network';
import { orderBookFailedOffline } from '@/features/market/orderBookView';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { pickHubFor, useHubFor } from '@/features/market/hub';
import { HubField } from '@/features/market/HubMenu';
import { DEFAULT_JUMP_RANGE } from '@/engine/route/jumpRange';
import { JumpRangeNote } from '@/features/route/JumpRangeControls';
import {
  MARKET_TREE_MATCH_LIMIT,
  MARKET_TREE_MIN_QUERY_LENGTH,
} from '@/features/market/marketTree';
import { MarketGroupTree } from '@/features/market/MarketGroupTree';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useIsPhone } from '@/lib/useIsPhone';
import { useFocusAfterCommit } from '@/lib/useFocusAfterCommit';
import { useFocusHeading } from '@/lib/useFocusHeading';
import { ItemPriceAlertBell } from '@/features/market/ItemPriceAlertBell';
import { CompareDrawer } from '@/features/market/CompareDrawer';
import { useCompareSet } from '@/features/market/compareSet';
import { QuickbarList } from '@/features/market/QuickbarList';
import { useMarketQuickbar } from '@/features/market/useMarketQuickbar';
import { useMarketOrderTables } from '@/features/market/useMarketOrderTables';
import { useMarketOrderBookView } from '@/features/market/useMarketOrderBookView';
import { PriceHistoryPanel } from '@/features/market/PriceHistoryPanel';
import { VariationsTable } from '@/features/market/VariationsTable';
import { quickbarToPasteText } from '@/features/market/quickbar';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { ALL_REGIONS } from '@/engine/market/locationMode';
import type { MarketAppraiseState } from '@/lib/shortcuts';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { PageSettingsButton } from '@/features/settings/PageSettingsModal';
import { AppraisalSettingsForm } from '@/features/market/AppraisalSettingsForm';
import { usePageHeaderSlots } from '@/features/market/pageHeaderSlots';
import { useAppraisalListUrl } from '@/features/market/useAppraisalListUrl';
import { useAppraisal } from '@/features/market/useAppraisal';
import { tradeHubStanding, useTradeHubStandings } from '@/features/market/useTradeHubStandings';
import {
  PRICE_PERCENT_PARAM,
  parsePricePercentParam,
  useMarketPricePercent,
} from '@/features/market/pricePercent';
import { useSharedAppraisalSeed } from '@/features/market/sharedAppraisalSeed';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { useMarketCatalogue } from '@/features/market/useMarketCatalogue';
import { useMarketBrowser, type MarketItemTab } from '@/features/market/useMarketBrowser';
import { BrowserFilterBar, OrderBookScopeBar } from '@/features/market/OrderBookScopeBar';
import {
  BookSideToggle,
  HubComparisonLine,
  OrderBookSummaryStrip,
  OrderSideCard,
  type BookSide,
} from '@/features/market/MarketOrderBook';
import { OrderRowDetail } from '@/features/market/OrderRowDetail';
import { ItemSkillsDisclosure } from '@/features/market/ItemSkillsDisclosure';
import { useOrderBookOrchestration } from '@/features/market/useOrderBookOrchestration';
import { useOrderRowSkills } from '@/features/market/useOrderRowSkills';
import { useRefiningSetup } from '@/features/refining/useRefiningSetup';
import { SELL_ORDER_COLUMN_IDS, BUY_ORDER_COLUMN_IDS } from '@/features/market/marketOrderColumns';

// One tab renders at a time: each panel loads on first visit, or as the
// pilot reaches for its tab (`preloadTab`).
const TAB_LOADERS = {
  orders: named(() => import('@/features/market/OrdersTab'), 'OrdersTab'),
  stock: named(() => import('@/features/stockTargets/StockTab'), 'StockTab'),
  history: named(() => import('@/features/market/TransactionsPanel'), 'TransactionsPanel'),
  appraisal: named(() => import('@/features/market/AppraisalPanel'), 'AppraisalPanel'),
};
const OrdersTab = lazy(TAB_LOADERS.orders);
const StockTab = lazy(TAB_LOADERS.stock);
const TransactionsPanel = lazy(TAB_LOADERS.history);
const AppraisalPanel = lazy(TAB_LOADERS.appraisal);
const preloadTab = preloadFrom(TAB_LOADERS);

/** Rows shown per side before "show all" (GLOSSARY.md). */
const ROW_CAP = 15;

/**
 * The page's own top-level tabs: Browser, Open orders, Stock, History (the
 * character's wallet fills), Appraisal. Distinct from `itemTab` below, the
 * selected item's own Order Book / Price History split.
 */
type MarketTab = (typeof MARKET_TABS.tabs)[number]['id'];

/**
 * The two sections quoted at a Trade Hub, and so the two that share the page
 * header's hub picker and refresh button.
 *
 * Appraisal deliberately does *not* get the **Location Mode** chips beside
 * them. Fuzzwork's aggregates — the appraisal's price source — are per
 * station, so a Region appraisal would mean one paginated ESI order-book call
 * per pasted line. A control drawn on a tab where it cannot do anything is
 * worse than one that is not there, so the chips stay with the Browser.
 */
function usesHubPicker(tab: MarketTab): boolean {
  return tab === 'browser' || tab === 'appraisal';
}

/**
 * Market Browser: find an item (search + Market Group tree, left) and see its
 * live Order Book at the current Location Mode's region (right), read from
 * ESI (ADR 0003). Location Mode (GLOSSARY.md round 9) is either Trade Hub
 * (that hub's region, filtered to its station) or Region (the whole region,
 * every station) — a device-local preference like the hub setting it
 * replaces as the sole location control. A globally-traded item (PLEX today)
 * overrides either mode: its own Global Market Region always wins (round
 * 12). The catalogue (groups/types/systems/stations/regions) is lazy-loaded,
 * not precached (GLOSSARY.md round 10) — most installs never open /market.
 */
export function Market() {
  const { t } = useTranslation();
  const location = useLocation();
  const [tab, setTab] = usePageTab(MARKET_TABS);
  const navigate = useNavigate();
  // Hauling's reload and its scan's Data Age sit in this page's title bar rather
  // than the panel header: the panel hands them up through this callback.
  const [haulingRefresh, setHaulingRefresh] = useState<HaulingRefreshInfo | null>(null);
  // Issue #726: true only immediately after the Quickbar's "View in
  // Appraisal" action, so the panel mounts with its Compare Hubs section
  // already open instead of collapsed.
  const [expandCompareOnAppraisal, setExpandCompareOnAppraisal] = useState(false);
  // `expandCompare` defaults false so every ordinary tab switch clears it —
  // only `handleViewQuickbarInAppraisal` passes `true`, and only that call's
  // own value should reach the next `AppraisalPanel` mount.
  function changeTab(next: MarketTab, expandCompare = false) {
    // The query string rides along between tabs, but Hauling's `from`/`to`/`cat`
    // are its own: crossing into or out of Hauling starts the other tab clean.
    if (next !== tab && (next === 'hauling' || tab === 'hauling')) {
      navigate(tabPath(MARKET_TABS, next));
    } else {
      setTab(next);
    }
    setExpandCompareOnAppraisal(expandCompare);
  }
  const isPhone = useIsPhone();
  // Open orders and History hang their Character picker, Refresh, export and
  // data age on the page header rather than on a title bar of their own.
  const tabOwnsHeader = tab === 'orders' || tab === 'history';
  const { slots: headerSlots, metaSlot, scopeSlot, actionsSlot } = usePageHeaderSlots();
  const viewsTabsId = useTabsId();
  const itemTabsId = useTabsId();
  const marketTabs = MARKET_TABS.tabs.map((item) => ({ id: item.id, label: t(item.labelKey) }));
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The Appraisal tab's other half of the same control pair as the header's hub picker.
  const savedPricePercent = useMarketPricePercent((state) => state.value);
  const setPricePercent = useMarketPricePercent((state) => state.setValue);
  useHydratedStore(useMarketPricePercent);
  // `?percent=` overrides the saved Price Percent for this visit, the way
  // `?hub=` overrides the saved hub — what a Shared Appraisal's "Open Neocom
  // Desk" lands with. Typing a percent writes the setting and drops the
  // override, so the field never fights the URL.
  const [searchParams, setSearchParams] = useSearchParams();
  const percentOverride = parsePricePercentParam(searchParams.get(PRICE_PERCENT_PARAM));
  const pricePercent = percentOverride ?? savedPricePercent;
  function handlePricePercentChange(value: number) {
    void setPricePercent(value);
    if (percentOverride === null) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(PRICE_PERCENT_PARAM);
        return next;
      },
      { replace: true }
    );
  }

  const compareCount = useCompareSet((state) => state.items.length);
  const addToCompare = useCompareSet((state) => state.add);
  const removeFromCompare = useCompareSet((state) => state.remove);

  // The Quickbar (GLOSSARY.md): Editable Data, one record per character. Reads
  // as [] rather than requiring an active character — Market Browser itself
  // needs none — so Add to Quickbar is disabled with nobody active.
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  // Item Actions (issue #2041): every item menu's Quickbar add, Show info (the
  // one Item Detail modal, priced at `orderBookLocation`) and the lazy
  // blueprint catalog behind Build Plan.
  const itemActions = usePageItemActions({
    activeCharacterId,
    lazyBlueprints: true,
    localInfo: true,
  });
  const {
    items: quickbarItems,
    write: writeQuickbar,
    pinWithTarget: handlePinWithTarget,
  } = itemActions.quickbar;

  // Issue #726: sends the Quickbar's contents into Appraisal, landing
  // directly on the multi-hub view (#689) rather than a collapsed one.
  function handleViewQuickbarInAppraisal() {
    appraisal.appraiseText(quickbarToPasteText(quickbarItems));
    changeTab('appraisal', true);
  }

  // Narrow screens show one column at a time (GLOSSARY.md round 8); matches
  // the grid's own `lg:` breakpoint so the JS-driven visibility and the CSS
  // layout switch at the same width.
  const isDesktop = useIsDesktop();
  const online = useOnline();

  const catalogue = useMarketCatalogue();
  const {
    groups,
    types,
    marketRegions,
    catalogueError,
    catalogueLoading,
    retry: retryCatalogue,
    groupsById,
    childrenByParent,
    typesByGroup,
    solarSystemMap,
  } = catalogue;

  const {
    selectedTypeId,
    selectedItem,
    effectiveLocation,
    effectiveHub,
    allRegions,
    chosenRegionId,
    hubHydrated,
    locationModeHydrated,
    handleModeChange,
    handleHubChange,
    handleRegionChange,
    handleSelectItem,
    handleBackToFinder,
    query,
    setQuery,
    expandedIds,
    searchCollapsedIds,
    searchCategories,
    filterResult,
    handleToggle,
    itemTab,
    setItemTab,
    compareRegionIds,
    setCompareRegionIds,
  } = useMarketBrowser({ groups, types, marketRegions, groupsById });

  // Spoken summary of the finder's result: the visible notes and the swap to
  // "No results" are plain text, so a screen reader hears nothing as you type.
  let browserStatus: string | null = null;
  if (filterResult) {
    browserStatus =
      filterResult.visibleGroupIds.size === 0 && !filterResult.bestMatch
        ? t('market.noResults')
        : t('market.searchMatchCount', { count: filterResult.totalMatches });
  } else if (query.trim().length > 0) {
    browserStatus = t('market.searchTooShort', { min: MARKET_TREE_MIN_QUERY_LENGTH });
  }

  // Focus management for the finder <-> item panel swap below the `lg:`
  // breakpoint (issue #1485): selecting an item hides the finder and shows
  // the item panel with no focus cue, and Back does the reverse. `enabled:
  // !isDesktop` — see `useFocusHeading`'s own doc comment for why that's a
  // separate param rather than folded into the key.
  const itemHeadingRef = useRef<HTMLHeadingElement>(null);
  // The Order Book's buttons that unmount themselves ("Show all", "Only this
  // station", "Clear filter") hand focus on through these (#3353).
  const focusAfterCommit = useFocusAfterCommit();
  const sellHeadingRef = useRef<HTMLHeadingElement>(null);
  const buyHeadingRef = useRef<HTMLHeadingElement>(null);
  const clearFilterRef = useRef<HTMLButtonElement>(null);
  useFocusHeading(itemHeadingRef, selectedTypeId, !isDesktop);
  const selectedInCompare = useCompareSet((state) =>
    state.items.some((item) => item.typeId === selectedTypeId)
  );
  const selectedPinned = quickbarItems.some((item) => item.typeId === selectedTypeId);

  // The finder Panel's own root, so Back can look up the tree button the
  // item was opened from without a global `document.querySelector` risking a
  // same-id match elsewhere (the Quickbar list also renders per-typeId rows).
  const finderPanelRef = useRef<HTMLElement>(null);
  // The item that was open when Back was pressed — read once by the effect
  // below, then cleared, so an unrelated `selectedTypeId` change (e.g. a
  // fresh deep link) never triggers a focus restore that wasn't asked for.
  const backToFinderTypeIdRef = useRef<number | null>(null);
  function handleBackToFinderAndRestoreFocus() {
    backToFinderTypeIdRef.current = selectedTypeId;
    handleBackToFinder();
  }
  useEffect(() => {
    if (selectedTypeId !== null) return;
    const wantedTypeId = backToFinderTypeIdRef.current;
    if (wantedTypeId === null) return;
    backToFinderTypeIdRef.current = null;
    const treeButton = finderPanelRef.current?.querySelector<HTMLElement>(
      `[data-tree-item-id="${wantedTypeId}"]`
    );
    if (treeButton) treeButton.focus();
    else searchInputRef.current?.focus();
  }, [selectedTypeId]);

  // Held here rather than inside `AppraisalPanel` so a pasted list survives a
  // trip to the Browser tab, and so the header's refresh button can drive it.
  const { setup: refiningSetup, hydrated: refiningHydrated } = useRefiningSetup();
  // Appraisal prices at its own page hub, apart from the hub the Browser is on.
  // On its tab `?hub=` overrides it for the visit, as `?percent=` does the Price
  // Percent (a Shared Appraisal's "Open Neocom Desk"); a pick drops the override.
  const { hubId: appraisalHubId } = useHubFor('appraisal');
  const appraisalHubOverride =
    tab === 'appraisal' ? getTradeHub(searchParams.get('hub') as TradeHub['id']) : undefined;
  const appraisalHub = appraisalHubOverride ?? getTradeHub(appraisalHubId) ?? DEFAULT_TRADE_HUB;
  /** After the Appraisal's hub menu wrote its pick: a link's visit-only hub then gives way to it. */
  function handleAppraisalHubPicked() {
    if (appraisalHubOverride === undefined) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('hub');
        return next;
      },
      { replace: true }
    );
  }
  const appraisal = useAppraisal(
    appraisalHub,
    pricePercent,
    activeCharacterId,
    refiningSetup,
    refiningHydrated
  );
  // A Fitting's Export menu, or a page-level paste (`app/GlobalPasteRouter.tsx`),
  // lands here with a list to appraise. Keyed on the navigation itself so a
  // re-render never re-submits it.
  const handledAppraiseKey = useRef<string | null>(null);
  useEffect(() => {
    const text = (location.state as Partial<MarketAppraiseState> | null)?.appraiseText;
    if (!text || handledAppraiseKey.current === location.key) return;
    handledAppraiseKey.current = location.key;
    appraisal.appraiseText(text);
  }, [location.key, location.state, appraisal]);
  // "Open Neocom Desk" on a stored Appraisal Share Link lands here with
  // `?share=<id>`, its hub and percent riding `?hub=` and `?percent=`.
  const sharedSeed = useSharedAppraisalSeed((text) => appraisal.appraiseText(text));
  // The appraised list rides `?list=`, so Back and a reload restore it.
  useAppraisalListUrl(appraisal, tab === 'appraisal');
  // Feeds the net-of-fees chips' broker fee — resolved once per character,
  // same as every other configurable-Trade-Hub broker-fee surface.
  const tradeHubStandings = useTradeHubStandings(activeCharacterId);

  const {
    orderBookLoading,
    refreshTick,
    myOrderIds,
    orderBookLocation,
    resolvedRegion,
    hubRegionName,
    currentSystem,
    jumpRangeFilter,
    regionMode,
    rangeAcross,
    singleRegionId,
    globalMarkets,
    stationFilter,
    setStationFilter,
    stationFilterLabel,
    npcStationMap,
    browserFilterValue,
    handleBrowserFiltersChange,
    activeFilters,
    filtersNarrowBook,
    orderBookFailed,
    regionsUnavailable,
    orderBookView,
    loadedView,
    sortedSell,
    sortedBuy,
    shownSell,
    hiddenBaitCount,
    depthByOrder,
    sellShowAll,
    setSellShowAll,
    buyShowAll,
    setBuyShowAll,
    failedRegionCount,
    jumpNoteShown,
    variationsResult,
    variationPrices,
    headerScopeSummary,
    refresh: refreshOrderBook,
  } = useOrderBookOrchestration({
    selectedTypeId,
    selectedItem,
    effectiveLocation,
    effectiveHub,
    allRegions,
    chosenRegionId,
    hubHydrated,
    locationModeHydrated,
    catalogue,
    activeCharacterId,
    ensureBlueprintCatalog: itemActions.actions.requestBlueprints,
    t,
  });
  function filterToStation(locationId: number) {
    focusAfterCommit(clearFilterRef);
    setStationFilter(locationId);
  }

  const {
    quickbarUndo,
    compareUndo,
    quickbarVsPaid,
    handleRemoveFromQuickbar,
    handleUndoQuickbarRemove,
    handleReorderQuickbar,
    handleCompareVariations,
    handleUndoCompareVariations,
    dismissQuickbarUndo,
    dismissCompareUndo,
  } = useMarketQuickbar({
    activeCharacterId,
    quickbarItems,
    writeQuickbar,
    effectiveHub,
    selectedTypeId,
    selectedItem,
    variationRows: variationsResult?.rows ?? null,
  });

  const itemMenu = useOpenAfterMenu();
  const selectedBlueprintTypeId =
    selectedTypeId === null ? null : itemActions.actions.blueprintFor(selectedTypeId);

  /**
   * A blueprint *original* can be sold on the market; a **copy** cannot — BPCs
   * are contract-only. So an empty order book on a blueprint is the one case
   * where "nobody is selling this" is misleading, and the honest answer is to
   * point at the BPC search rather than leave the pilot to conclude the item
   * is unavailable.
   */
  const selectedIsBlueprint =
    selectedTypeId !== null &&
    (itemActions.actions.blueprints?.byBlueprintTypeID.has(selectedTypeId) ?? false);

  // Hide bait sells trims what the table shows (`shownSell`); export, depth
  // and best prices keep the real book (`sortedSell`).
  const sellRowCap = sellShowAll ? undefined : ROW_CAP;
  const buyRowCap = buyShowAll ? undefined : ROW_CAP;

  // One station, already named by the scope bar: no Location column to repeat it.
  const singleStationBook =
    !(rangeAcross && browserFilterValue.jumps !== 'any') && effectiveLocation.mode === 'hub';
  const knownJumps = jumpRangeFilter.jumpsStatus === 'ready' ? jumpRangeFilter.jumps : null;
  const {
    visibleOrderColumns,
    toggleOrderColumn,
    orderColumnsById,
    baseColumns,
    buyColumns,
    sellHiddenColumns,
    buyHiddenColumns,
    sellExport,
    buyExport,
    pickableColumns,
    orderBookRef,
    orderCards,
  } = useMarketOrderTables({
    t,
    activeCharacterId,
    hubMode: effectiveLocation.mode === 'hub',
    effectiveHubId: effectiveHub.id,
    tradeHubStandings,
    npcStationMap,
    solarSystemMap,
    myOrderIds,
    jumpRangeFilter,
    singleStationBook,
    loadedView,
    sortedSell,
    sortedBuy,
    shownSell,
  });

  const { itemSkills, trainedSkills, targetPlan } = useOrderRowSkills(
    selectedTypeId,
    activeCharacterId
  );

  const {
    handleRefresh,
    orderRowClassName,
    orderRowContextMenu,
    noOrders,
    scopeLabel,
    bookScope,
    priceScopeName,
    scopeNote,
  } = useMarketOrderBookView({
    t,
    onBrowserTab: tab === 'browser',
    onAppraisalTab: tab === 'appraisal',
    refreshAppraisal: appraisal.refresh,
    catalogueError,
    retryCatalogue,
    refreshOrderBook,
    npcStationMap,
    solarSystemMap,
    marketRegions,
    myOrderIds,
    setStationFilter,
    selectedTypeId,
    selectedItemName: selectedItem?.name,
    effectiveLocation,
    effectiveHub,
    allRegions,
    chosenRegionId,
    hubRegionName,
    rangeAcross,
    browserFilterValue,
    singleRegionId,
    globalMarkets,
    sortedSell,
    sortedBuy,
    knownJumps,
  });

  // A phone shows one side of the book at a time (`BookSideToggle`).
  const [phoneSide, setPhoneSide] = useState<BookSide>('sell');

  // Narrow screens only: on desktop the item finder is already on screen
  // beside the item, so there is nothing to go back to. It sits in the
  // Panel's `leading` slot, immediately left of the item name — it means
  // "back from this item", so it belongs against the name rather than parked
  // on the opposite edge of the header.
  const showBackControl = !isDesktop && selectedTypeId !== null;
  const itemPanelLeading = showBackControl ? (
    <IconButton
      size="sm"
      icon={<Icon.Back />}
      label={t('market.backToFinder')}
      onClick={handleBackToFinderAndRestoreFocus}
    />
  ) : undefined;

  const browserFilterBarProps = {
    value: browserFilterValue,
    onChange: handleBrowserFiltersChange,
    active: activeFilters,
    regionMode,
    scopeLabel,
    currentSystem,
  };

  const itemTabs = (
    <Tabs
      tabsId={itemTabsId}
      tabs={[
        { id: 'orders', label: t('market.tabOrders') },
        {
          id: 'variations',
          label:
            variationsResult && variationsResult.rows.length > 0
              ? t('market.tabVariationsCount', { count: variationsResult.rows.length })
              : t('market.tabVariations'),
        },
        { id: 'history', label: t('market.tabHistory') },
      ]}
      value={itemTab}
      onChange={(id) => setItemTab(id as MarketItemTab)}
      label={t('market.itemTabsLabel')}
    />
  );

  return (
    <ItemActionsProvider page={itemActions} detailLocation={orderBookLocation}>
      <div className="mx-auto max-w-page space-y-4">
        {tab === 'orders' && <FromWalletCrumb />}
        <PageHeader
          title={t('market.title')}
          meta={
            tabOwnsHeader ? (
              metaSlot
            ) : tab === 'hauling' && haulingRefresh?.fetchedAt != null ? (
              <DataAgeBadge
                date={new Date(haulingRefresh.fetchedAt)}
                note={t('market.hauling.dataAgeNote')}
              />
            ) : undefined
          }
          // Only the Character tabs have a picker; the others must not lock the row.
          scope={tabOwnsHeader ? scopeSlot : undefined}
          actions={
            usesHubPicker(tab) ? (
              <>
                {/* The mode chip and the picker next to it printed the same words
                  twice — "TRADE HUB · REGION · TRADE HUB [Jita]". The selected chip
                  *is* the picker's label, so the picker keeps the string as its
                  `aria-label` only: still announced, no longer duplicated on
                  screen.

                  Browser only: see `usesHubPicker`. Appraisal prices at a
                  station, so it has no Region mode to toggle into, and its hub
                  picker sits in the panel beside Price %. */}
                {tab === 'browser' && (
                  <div role="group" aria-label={t('market.locationMode')} className="flex gap-2">
                    <FilterChip
                      label={t('market.modeHub')}
                      size="md"
                      selected={effectiveLocation.mode === 'hub'}
                      onToggle={() => handleModeChange('hub')}
                    />
                    <FilterChip
                      label={t('market.modeRegion')}
                      size="md"
                      selected={effectiveLocation.mode === 'region'}
                      onToggle={() => handleModeChange('region')}
                    />
                  </div>
                )}
                {tab === 'appraisal' ? null : effectiveLocation.mode === 'hub' ? (
                  <HubField
                    area="market"
                    label={t('market.tradeHub')}
                    shownHubId={effectiveHub.id}
                    onPicked={handleHubChange}
                    className="w-32 sm:w-44"
                  />
                ) : (
                  // "All regions" (`null` to the picker) fans the selected item's
                  // book out over every region; see `allRegionsFetchKey`.
                  <RegionSelect
                    options={marketRegions ?? []}
                    value={allRegions ? null : chosenRegionId}
                    onChange={(regionId) => handleRegionChange(regionId ?? ALL_REGIONS)}
                    allLabel={t('market.allRegions')}
                    searchPlaceholder={t('common.searchRegions')}
                    noResultsLabel={t('common.noRegionMatches')}
                    aria-label={t('market.region')}
                    className="w-32 sm:w-44"
                  />
                )}
                {tab === 'appraisal' && (
                  <PageSettingsButton pageName={t('market.sections.appraisal')} section="market">
                    <AppraisalSettingsForm characterId={activeCharacterId} />
                  </PageSettingsButton>
                )}
                <IconButton
                  icon={<Icon.Refresh />}
                  label={t('market.refresh')}
                  onClick={handleRefresh}
                  // Section-aware: on the Browser this re-reads the selected
                  // item's order book, on Appraisal it re-prices the pasted
                  // list. Both are "refresh what is on screen", and neither has
                  // anything to do until there *is* something on screen.
                  busy={
                    tab === 'appraisal'
                      ? appraisal.result === null || appraisal.loading || appraisal.live.checking
                      : !catalogueError && (selectedTypeId === null || orderBookLoading)
                  }
                />
              </>
            ) : tabOwnsHeader ? (
              actionsSlot
            ) : tab === 'hauling' && haulingRefresh ? (
              <IconButton
                icon={<Icon.Refresh />}
                label={t('market.refresh')}
                onClick={haulingRefresh.refresh}
                busy={haulingRefresh.disabled}
              />
            ) : undefined
          }
        />

        <Tabs
          tabsId={viewsTabsId}
          label={t('market.title')}
          value={tab}
          onChange={(id) => changeTab(id as MarketTab)}
          onPreload={preloadTab}
          tabs={marketTabs}
        />

        <TabPanel tabsId={viewsTabsId} tabId={tab}>
          <Suspense fallback={null}>
            {tab === 'orders' && <OrdersTab headerSlots={headerSlots} />}
            {tab === 'stock' && <StockTab activeCharacterId={activeCharacterId} />}

            {tab === 'history' && <TransactionsPanel headerSlots={headerSlots} />}

            {/* The list itself lives in `useAppraisal` at route level, so switching
          to the Browser and back does not throw away a forty-line paste. */}
            {tab === 'appraisal' && (
              <AppraisalPanel
                controller={appraisal}
                pricePercent={pricePercent}
                onPricePercentChange={handlePricePercentChange}
                hub={appraisalHub}
                onHubChange={(id) => {
                  void pickHubFor('appraisal', id);
                  handleAppraisalHubPicked();
                }}
                onHubPicked={handleAppraisalHubPicked}
                standing={tradeHubStanding(tradeHubStandings, appraisalHub.id)}
                characterId={activeCharacterId}
                defaultCompareExpanded={expandCompareOnAppraisal}
              />
            )}
          </Suspense>

          {/* Hauling picks its own From/To hubs, so the header hub picker
              (`usesHubPicker`) stays off it. */}
          {tab === 'hauling' && <HaulingPanel onRefreshInfoChange={setHaulingRefresh} />}

          {tab === 'browser' && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr] lg:items-start">
              <Panel
                ref={finderPanelRef}
                // Sticky beside a long order book, so the search stays in reach
                // while the book scrolls.
                fill
                className={
                  isDesktop || selectedTypeId === null
                    ? 'lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-2rem)] lg:flex-col'
                    : 'hidden'
                }
              >
                <BrowserFilterBar
                  {...browserFilterBarProps}
                  search={
                    <SearchInput
                      ref={searchInputRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('market.searchPlaceholder')}
                      aria-label={t('market.searchLabel')}
                      className="min-w-0 flex-1"
                    />
                  }
                />

                <LiveStatus>{browserStatus}</LiveStatus>

                {query.trim().length > 0 && query.trim().length < MARKET_TREE_MIN_QUERY_LENGTH && (
                  <p className="shrink-0 pt-2 text-[0.6875rem] text-text-dim uppercase">
                    {t('market.searchTooShort', { min: MARKET_TREE_MIN_QUERY_LENGTH })}
                  </p>
                )}

                {filterResult?.fuzzy && (
                  <p className="shrink-0 pt-2 text-[0.6875rem] text-text-dim uppercase">
                    {t('market.searchFuzzy')}
                  </p>
                )}

                {filterResult?.capped && (
                  <p className="shrink-0 pt-2 text-[0.6875rem] text-warning uppercase">
                    {t('market.searchCapped', {
                      limit: MARKET_TREE_MATCH_LIMIT,
                      total: filterResult.totalMatches,
                    })}
                  </p>
                )}

                {catalogueError ? (
                  <EmptyState
                    title={t('market.loadFailedTitle')}
                    hint={online ? t('market.loadFailedHint') : t('market.loadFailedOfflineHint')}
                    className="py-8"
                  />
                ) : catalogueLoading ? (
                  <Spinner block="panel" label={t('common.loading')} />
                ) : filterResult &&
                  filterResult.visibleGroupIds.size === 0 &&
                  !filterResult.bestMatch ? (
                  <EmptyState title={t('market.noResults')} className="py-8" />
                ) : (
                  <div className="mt-3 flex min-h-0 flex-col border-t border-line pt-2 lg:flex-1">
                    <MarketGroupTree
                      groups={groups ?? []}
                      childrenByParent={childrenByParent}
                      typesByGroup={typesByGroup}
                      filterResult={filterResult}
                      expandedIds={expandedIds}
                      searchCollapsedIds={searchCollapsedIds}
                      searchCategories={searchCategories}
                      onToggle={handleToggle}
                      onSelect={handleSelectItem}
                      selectedTypeId={selectedTypeId}
                      noOrders={noOrders}
                    />
                  </div>
                )}

                <QuickbarList
                  items={quickbarItems}
                  vsPaid={quickbarVsPaid}
                  selectedTypeId={selectedTypeId}
                  onSelect={handleSelectItem}
                  onRemove={handleRemoveFromQuickbar}
                  onReorder={handleReorderQuickbar}
                  onViewInAppraisal={handleViewQuickbarInAppraisal}
                />
              </Panel>

              <Panel
                // `min-w-0`: a grid track doesn't shrink a child below its own
                // intrinsic content width by default — a wide table row here
                // was forcing the whole page to scroll sideways.
                className={`min-w-0 ${isDesktop || selectedTypeId !== null ? '' : 'hidden'}`}
                title={selectedItem?.name}
                headingRef={itemHeadingRef}
                actions={
                  selectedItem &&
                  selectedTypeId !== null && (
                    <span className="flex items-center gap-1 max-md:shrink-0 max-md:flex-nowrap">
                      <IconButton
                        size="md"
                        icon={<Icon.Pin weight={selectedPinned ? 'fill' : 'light'} />}
                        label={t(
                          selectedPinned
                            ? 'market.quickbar.removeFromQuickbar'
                            : 'market.contextMenu.addToQuickbar'
                        )}
                        tooltip={
                          activeCharacterId === null
                            ? t('market.contextMenu.quickbarNoCharacter')
                            : undefined
                        }
                        pressed={selectedPinned}
                        aria-disabled={activeCharacterId === null || undefined}
                        openOnTap={activeCharacterId === null}
                        className="aria-disabled:cursor-default aria-disabled:opacity-40"
                        onClick={() => {
                          if (activeCharacterId === null) return;
                          if (selectedPinned) handleRemoveFromQuickbar(selectedTypeId);
                          else itemActions.actions.addToQuickbar(selectedTypeId, selectedItem.name);
                        }}
                      />
                      <ItemPriceAlertBell
                        typeId={selectedTypeId}
                        name={selectedItem.name}
                        item={quickbarItems.find((i) => i.typeId === selectedTypeId)}
                        disabled={activeCharacterId === null}
                        onPin={handlePinWithTarget}
                      />
                      <DropdownMenu
                        onOpenChange={(open) => {
                          // Market loads the blueprint catalog lazily; Build Plan needs it.
                          if (open) itemActions.actions.requestBlueprints();
                        }}
                      >
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            size="md"
                            icon={<Icon.More />}
                            label={t('common.moreActions')}
                          />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          onCloseAutoFocus={itemMenu.onCloseAutoFocus}
                        >
                          <DropdownMenuItem
                            onSelect={() =>
                              selectedInCompare
                                ? removeFromCompare(selectedTypeId)
                                : addToCompare({
                                    typeId: selectedTypeId,
                                    itemName: selectedItem.name,
                                  })
                            }
                          >
                            {t(
                              selectedInCompare
                                ? 'market.compare.removeFromCompare'
                                : 'market.contextMenu.addToCompare'
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              itemMenu.run(() =>
                                itemActions.actions.showInfo(selectedTypeId, selectedItem.name)
                              )
                            }
                          >
                            {t('market.contextMenu.showInfo')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            aria-disabled={!selectedBlueprintTypeId || undefined}
                            onSelect={() => {
                              if (selectedBlueprintTypeId)
                                navigate(`${industryTabHref('plans')}?product=${selectedTypeId}`);
                            }}
                          >
                            {selectedBlueprintTypeId === undefined
                              ? t('industry.contextMenu.buildPlanChecking')
                              : selectedBlueprintTypeId === null
                                ? t('industry.contextMenu.noBlueprintOptions')
                                : t('industry.contextMenu.buildPlan')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </span>
                  )
                }
                padded={false}
                leading={itemPanelLeading}
              >
                {selectedTypeId === null ? (
                  <EmptyState
                    title={t('market.selectPromptTitle')}
                    hint={t('market.selectPromptHint')}
                    className="px-3 py-8"
                  />
                ) : (
                  <div className="space-y-3 px-3 pt-2 pb-3">
                    <ItemSkillsDisclosure
                      typeId={selectedTypeId}
                      itemSkills={itemSkills}
                      trainedSkills={trainedSkills}
                      targetPlan={targetPlan}
                      hasCharacter={activeCharacterId !== null}
                      itemName={selectedItem?.name ?? ''}
                    />
                    {/* Above every tab: Variations and Price History are readers
                      its note names. */}
                    <OrderBookScopeBar
                      scope={bookScope}
                      filterValue={browserFilterValue}
                      onFilterChange={handleBrowserFiltersChange}
                      active={activeFilters}
                      regionMode={regionMode}
                      scopeLabel={scopeLabel}
                      currentSystem={currentSystem}
                      note={scopeNote}
                    />
                    {itemTabs}
                    <TabPanel tabsId={itemTabsId} tabId={itemTab}>
                      {itemTab === 'history' ? (
                        resolvedRegion && (
                          <PriceHistoryPanel
                            regionId={resolvedRegion.regionId}
                            typeId={selectedTypeId}
                            itemName={selectedItem?.name ?? ''}
                            compare={
                              // A Global Market Region item trades nowhere
                              // else, so there is no other region to compare.
                              resolvedRegion.override || !marketRegions
                                ? undefined
                                : {
                                    regionIds: compareRegionIds,
                                    onChange: setCompareRegionIds,
                                    regions: marketRegions,
                                  }
                            }
                          />
                        )
                      ) : itemTab === 'variations' ? (
                        variationsResult && variationsResult.rows.length > 0 ? (
                          <VariationsTable
                            rows={variationsResult.rows}
                            prices={variationPrices}
                            onSelect={handleSelectItem}
                            onCompare={handleCompareVariations}
                            selfName={selectedItem?.name ?? ''}
                            selfSummary={headerScopeSummary}
                            scopeName={priceScopeName}
                          />
                        ) : (
                          <EmptyState title={t('market.variations.none')} className="py-8" />
                        )
                      ) : orderBookLoading &&
                        !regionsUnavailable &&
                        (!orderBookView || orderBookFailed) ? (
                        <Spinner block="panel" label={t('common.loading')} />
                      ) : orderBookFailed ? (
                        // Not the empty book: ESI didn't answer (a 420, or the Error
                        // Budget declining to send), which says nothing about who
                        // trades the item — so no "nobody is selling" copy and no
                        // blueprint BPC hint, just the failure and a way to retry.
                        <EmptyState
                          title={t('market.orderBookFailedTitle')}
                          hint={t(
                            orderBookFailedOffline(orderBookView, online)
                              ? 'market.orderBookFailedOfflineHint'
                              : 'market.orderBookFailedHint'
                          )}
                          className="py-8"
                          action={
                            <Button size="sm" onClick={handleRefresh}>
                              {t('market.orderBookFailedRetry')}
                            </Button>
                          }
                        />
                      ) : (
                        <div ref={orderBookRef} className="space-y-3">
                          {resolvedRegion?.override && (
                            <p className="m-0 text-[0.6875rem] text-text-dim">
                              {t('market.globalMarketNote', {
                                regionName: resolvedRegion.override.regionName,
                              })}
                            </p>
                          )}
                          {/* In the book, not the finder's funnel, so a collapsed bar can't hide why a range isn't applying. */}
                          {(jumpNoteShown || failedRegionCount > 0) && (
                            <div className="flex flex-col items-end gap-1 text-xs text-text-dim">
                              {jumpNoteShown && <JumpRangeNote status={jumpRangeFilter.status} />}
                              {failedRegionCount > 0 && (
                                <LiveNote className="text-warning">
                                  {t('market.regionsFailed', { count: failedRegionCount })}
                                </LiveNote>
                              )}
                            </div>
                          )}
                          {stationFilter !== null && (
                            <div className="flex items-center justify-between gap-2 text-xs text-text-dim">
                              <span>
                                {t('market.stationFilterActive', {
                                  station: stationFilterLabel ?? t('market.unknownStructure'),
                                })}
                              </span>
                              <Button
                                ref={clearFilterRef}
                                size="sm"
                                onClick={() => {
                                  // Sell's heading, or Buy's when the phone toggle hides Sell.
                                  focusAfterCommit(
                                    isPhone && phoneSide === 'buy' ? buyHeadingRef : sellHeadingRef
                                  );
                                  setStationFilter(null);
                                }}
                              >
                                {t('market.clearStationFilter')}
                              </Button>
                            </div>
                          )}
                          {rangeAcross && stationFilter === null && (
                            <HubComparisonLine
                              placeName={priceScopeName}
                              summary={headerScopeSummary}
                              inRangeBestSell={loadedView?.summary.bestSell ?? null}
                              inRangeBestBuy={loadedView?.summary.bestBuy ?? null}
                              jumps={
                                effectiveLocation.mode === 'hub'
                                  ? (knownJumps?.get(effectiveHub.systemId) ?? null)
                                  : null
                              }
                              stationId={
                                effectiveLocation.mode === 'hub' ? effectiveHub.stationId : null
                              }
                              onView={() =>
                                handleBrowserFiltersChange({
                                  ...browserFilterValue,
                                  jumps: DEFAULT_JUMP_RANGE,
                                })
                              }
                            />
                          )}
                          <OrderBookSummaryStrip
                            bestSell={loadedView?.summary.bestSell ?? null}
                            bestBuy={loadedView?.summary.bestBuy ?? null}
                          />
                          <BookSideToggle
                            side={phoneSide}
                            onChange={setPhoneSide}
                            sellCount={shownSell.length}
                            buyCount={sortedBuy.length}
                            bestSell={loadedView?.summary.bestSell ?? null}
                            bestBuy={loadedView?.summary.bestBuy ?? null}
                          />
                          <OrderSideCard
                            side="sell"
                            rows={shownSell}
                            rowCap={sellRowCap}
                            total={shownSell.length}
                            hiddenBaitCount={hiddenBaitCount}
                            best={loadedView?.summary.bestSell ?? null}
                            columns={baseColumns}
                            availableColumns={pickableColumns(SELL_ORDER_COLUMN_IDS)}
                            visibleColumns={visibleOrderColumns}
                            columnsById={orderColumnsById}
                            onToggleColumn={toggleOrderColumn}
                            tableExport={sellExport}
                            hiddenOnPhone={phoneSide !== 'sell'}
                            cards={orderCards}
                            headingRef={sellHeadingRef}
                            onShowAll={
                              !sellShowAll && shownSell.length > ROW_CAP
                                ? () => {
                                    focusAfterCommit(sellHeadingRef);
                                    setSellShowAll(true);
                                  }
                                : null
                            }
                            rowContextMenu={orderRowContextMenu}
                            rowClassName={orderRowClassName}
                            renderDetail={(o) => (
                              <OrderRowDetail
                                order={o}
                                best={loadedView?.summary.bestSell ?? null}
                                depth={depthByOrder.get(o.order_id)}
                                npcStations={npcStationMap}
                                solarSystems={solarSystemMap}
                                hiddenColumns={sellHiddenColumns}
                                orderColumnsById={orderColumnsById}
                                onFilterToStation={stationFilter === null ? filterToStation : null}
                              />
                            )}
                            empty={
                              <EmptyState
                                title={t('market.emptySellTitle')}
                                hint={
                                  stationFilter !== null
                                    ? t('market.emptyFilteredHint')
                                    : filtersNarrowBook
                                      ? t('market.emptyFiltersHint')
                                      : selectedIsBlueprint
                                        ? t('market.emptySellBlueprintHint')
                                        : t('market.emptySellHint')
                                }
                                className="py-6"
                                action={
                                  selectedIsBlueprint && !filtersNarrowBook ? (
                                    <Link
                                      to={bpcSourcingHref(selectedTypeId)}
                                      className={buttonClassName({ size: 'sm' })}
                                    >
                                      {t('market.searchBpcContracts')}
                                    </Link>
                                  ) : undefined
                                }
                              />
                            }
                          />
                          <OrderSideCard
                            side="buy"
                            rows={sortedBuy}
                            rowCap={buyRowCap}
                            total={sortedBuy.length}
                            best={loadedView?.summary.bestBuy ?? null}
                            columns={buyColumns}
                            availableColumns={pickableColumns(BUY_ORDER_COLUMN_IDS)}
                            visibleColumns={visibleOrderColumns}
                            columnsById={orderColumnsById}
                            onToggleColumn={toggleOrderColumn}
                            tableExport={buyExport}
                            hiddenOnPhone={phoneSide !== 'buy'}
                            cards={orderCards}
                            headingRef={buyHeadingRef}
                            onShowAll={
                              !buyShowAll && sortedBuy.length > ROW_CAP
                                ? () => {
                                    focusAfterCommit(buyHeadingRef);
                                    setBuyShowAll(true);
                                  }
                                : null
                            }
                            rowContextMenu={orderRowContextMenu}
                            rowClassName={orderRowClassName}
                            renderDetail={(o) => (
                              <OrderRowDetail
                                order={o}
                                best={loadedView?.summary.bestBuy ?? null}
                                depth={depthByOrder.get(o.order_id)}
                                npcStations={npcStationMap}
                                solarSystems={solarSystemMap}
                                hiddenColumns={buyHiddenColumns}
                                orderColumnsById={orderColumnsById}
                                onFilterToStation={stationFilter === null ? filterToStation : null}
                              />
                            )}
                            empty={
                              <EmptyState
                                title={t('market.emptyBuyTitle')}
                                hint={
                                  stationFilter !== null
                                    ? t('market.emptyFilteredHint')
                                    : filtersNarrowBook
                                      ? t('market.emptyFiltersHint')
                                      : t('market.emptyBuyHint')
                                }
                                className="py-6"
                              />
                            }
                          />
                        </div>
                      )}
                    </TabPanel>
                  </div>
                )}
              </Panel>
            </div>
          )}
        </TabPanel>

        {compareCount > 0 && (
          <CompareDrawer
            location={orderBookLocation}
            refreshTick={refreshTick}
            characterId={activeCharacterId}
            hub={effectiveHub}
            standing={tradeHubStanding(tradeHubStandings, effectiveHub.id)}
            sourceLabel={
              effectiveLocation.mode === 'hub'
                ? effectiveHub.systemName
                : (marketRegions?.find((region) => region.id === orderBookLocation.regionId)
                    ?.name ?? hubRegionName)
            }
          />
        )}

        {sharedSeed.loadFailed && (
          <Toast
            message={t('market.sharedAppraisalLoadFailed')}
            // Stays mounted, busy, until the retry settles: it unmounts only on success.
            action={{
              label: sharedSeed.retrying ? t('common.loading') : t('common.retry'),
              onAction: sharedSeed.retrying ? () => {} : sharedSeed.retry,
            }}
            onClose={sharedSeed.dismiss}
          />
        )}

        {quickbarUndo && quickbarUndo.characterId === activeCharacterId && (
          <Toast
            message={t('market.quickbar.removed', { name: quickbarUndo.item.name })}
            undo={{ label: t('market.quickbar.undo'), onUndo: handleUndoQuickbarRemove }}
            onClose={dismissQuickbarUndo}
          />
        )}

        {compareUndo && (
          <Toast
            message={t('market.compareUndo.added', {
              count: compareUndo.count,
              name: compareUndo.itemName,
            })}
            undo={{ label: t('market.compareUndo.undo'), onUndo: handleUndoCompareVariations }}
            onClose={dismissCompareUndo}
          />
        )}
      </div>
    </ItemActionsProvider>
  );
}
