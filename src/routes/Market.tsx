import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { usePageTab } from '@/lib/usePageTab';
import { MARKET_TABS } from '@/app/pageTabs';
import {
  Button,
  Caret,
  EmptyState,
  FilterChip,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  RegionSelect,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  Tabs,
  Toast,
  TypeIcon,
  RowMoreActions,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { DEFAULT_JUMP_RANGE } from '@/engine/route/jumpRange';
import { JumpRangeNote } from '@/features/route/JumpRangeControls';
import {
  MARKET_TREE_MATCH_LIMIT,
  MARKET_TREE_MIN_QUERY_LENGTH,
  type MarketTreeFilterResult,
} from '@/features/market/marketTree';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useIsPhone } from '@/lib/useIsPhone';
import { useElementNarrowerThan } from '@/lib/useElementNarrowerThan';
import { useFocusHeading } from '@/lib/useFocusHeading';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { ItemPriceAlertBell } from '@/features/market/ItemPriceAlertBell';
import { OrderRowContextMenu } from '@/features/market/OrderRowContextMenu';
import { CompareDrawer } from '@/features/market/CompareDrawer';
import { useCompareSet } from '@/features/market/compareSet';
import { QuickbarList } from '@/features/market/QuickbarList';
import { PriceHistoryPanel } from '@/features/market/PriceHistoryPanel';
import { VariationsTable } from '@/features/market/VariationsTable';
import {
  quickbarToPasteText,
  removeQuickbarItem,
  reorderQuickbarItems,
} from '@/features/market/quickbar';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { ALL_REGIONS } from '@/engine/market/locationMode';
import type { RegionOrder } from '@/esi/endpoints';
import type { MarketAppraiseState } from '@/lib/shortcuts';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { useTableExport } from '@/components/ui/useTableExport';
import { orderBookCsvColumns } from '@/features/market/orderBookCsv';
import { OpenOrdersPanel } from '@/features/market/OpenOrdersPanel';
import { OrderHistoryPanel } from '@/features/market/OrderHistoryPanel';
import { TransactionsPanel } from '@/features/market/TransactionsPanel';
import { AppraisalPanel } from '@/features/market/AppraisalPanel';
import { HaulingPanel, type HaulingRefreshInfo } from '@/features/market/HaulingPanel';
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
import {
  BrowserFilterBar,
  OrderBookScopeBar,
  type OrderBookScope,
} from '@/features/market/OrderBookScopeBar';
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
import { useMarketOrderColumns } from '@/features/market/useMarketOrderColumns';
import {
  SELL_ORDER_COLUMN_IDS,
  BUY_ORDER_COLUMN_IDS,
  orderBookFigureChars,
  orderBookWidthsRem,
  useVisibleMarketOrderColumns,
} from '@/features/market/marketOrderColumns';
import { useTimedToast } from '@/components/ui/useTimedToast';

/** Rows shown per side before "show all" (CONTEXT.md). */
const ROW_CAP = 15;

/**
 * The page's own top-level tabs: Market Browser plus a character's Open
 * orders and History — previously the separate `/orders` route (open +
 * history) and Wallet's Transactions tab. Distinct from `itemTab` below,
 * which is the *selected item's* own Order Book / Price History split and
 * has nothing to do with this.
 *
 * `history` and `history/transactions` are one tab wearing two hats: both are
 * the character's past, they overlap on item and side, and they answer the
 * same question from either end — which orders ended, and which fills paid
 * out. So History is the tab, and the view is picked from a select in the
 * table's own header (`HistoryViewSelect`) rather than a second row of tabs
 * (round 54). `history/transactions` is still its own `MARKET_TABS` entry —
 * a tab id containing a literal `/` (`docs/ARCHITECTURE.md` §9) — so it gets
 * a real, distinct, bookmarkable path without either needing a second row of
 * tabs or teaching the shared tab foundation about subtabs.
 */
type MarketTab = (typeof MARKET_TABS.tabs)[number]['id'];

function isHistoryView(tab: MarketTab): tab is 'history' | 'history/transactions' {
  return tab === 'history' || tab === 'history/transactions';
}

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

interface MarketGroupTreeProps {
  groups: readonly MarketGroupNode[];
  childrenByParent: ReadonlyMap<number | null, MarketGroupNode[]>;
  typesByGroup: ReadonlyMap<number, MarketTypeEntry[]>;
  filterResult: MarketTreeFilterResult | null;
  expandedIds: ReadonlySet<number>;
  searchCollapsedIds: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onSelect: (typeId: number) => void;
  selectedTypeId: number | null;
}

function MarketGroupTree({
  childrenByParent,
  typesByGroup,
  filterResult,
  expandedIds,
  searchCollapsedIds,
  onToggle,
  onSelect,
  selectedTypeId,
}: MarketGroupTreeProps) {
  const { t } = useTranslation();
  const filtering = filterResult !== null;

  function renderItem(item: MarketTypeEntry, itemDepth: number) {
    return (
      <li key={item.typeId}>
        <ItemContextMenu typeId={item.typeId} itemName={item.name}>
          {/* The trigger holds the More actions button beside the
                  item button (buttons don't nest), so both sit inside
                  the menu. */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(item.typeId)}
              style={{ paddingLeft: `${itemDepth * 0.75 + 0.75}rem` }}
              // Read back on Back-to-finder (issue #1485), to return focus
              // to the row that opened the item panel — `data-` rather
              // than an id/ref, since the tree fully unmounts/remounts
              // whenever a search collapses or re-expands a group.
              data-tree-item-id={item.typeId}
              aria-current={selectedTypeId === item.typeId ? 'true' : undefined}
              className={`flex min-h-11 min-w-0 flex-1 items-center gap-1.5 truncate py-1 text-left text-xs hover:text-accent md:min-h-0 ${
                selectedTypeId === item.typeId ? 'text-accent' : 'text-text-dim'
              }`}
            >
              <TypeIcon typeId={item.typeId} size={32} className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.name}</span>
            </button>
            <RowMoreActions />
          </div>
        </ItemContextMenu>
      </li>
    );
  }

  function renderGroup(group: MarketGroupNode, depth: number) {
    if (filtering && !filterResult.visibleGroupIds.has(group.id)) return null;
    const children = childrenByParent.get(group.id) ?? [];
    const items = filtering
      ? (filterResult.matchedTypesByGroup.get(group.id) ?? [])
      : group.hasTypes
        ? (typesByGroup.get(group.id) ?? [])
        : [];
    // Matched branches default open (marketTree.ts), but that default is just
    // a starting point: `onToggle` below lets the user collapse/re-expand any
    // group while search is active, independent of which items still match.
    // Search only ever prunes *items*, never forces expand state.
    const expanded = filtering ? !searchCollapsedIds.has(group.id) : expandedIds.has(group.id);
    const expandable = children.length > 0 || items.length > 0;

    // `min-h-11 md:min-h-0` gives a thumb the 44px floor on the leaf row and
    // on an expandable header — a disabled header is inert, so it stays dense
    // rather than spending 44px of the phone's scrollport on nothing (55 of
    // the catalogue's groups are childless and itemless, five in a row under
    // ECCM alone). Not `controlHeightClassName.md`: its `md:h-9` would grow
    // desktop's 24px rows too, which this fix must not do.
    return (
      <li key={group.id}>
        <button
          type="button"
          disabled={!expandable}
          aria-expanded={expandable ? expanded : undefined}
          onClick={() => onToggle(group.id)}
          style={{ paddingLeft: `${depth * 0.75}rem` }}
          className={`flex w-full items-center gap-1.5 py-1 text-left text-xs text-text hover:text-accent disabled:hover:text-text ${
            expandable ? 'min-h-11 md:min-h-0' : ''
          }`}
        >
          {expandable && <Caret expanded={expanded} />}
          <span className={expandable ? '' : 'pl-3'}>{group.name}</span>
        </button>
        {expanded && (children.length > 0 || items.length > 0) && (
          <ul>
            {children.map((child) => renderGroup(child, depth + 1))}
            {items.map((item) => renderItem(item, depth + 1))}
          </ul>
        )}
      </li>
    );
  }

  const roots = childrenByParent.get(null) ?? [];
  return (
    // Flat cap, not viewport-relative: `QuickbarList` renders below this
    // tree in the same column, so sizing the tree to all remaining viewport
    // height would push the quickbar off-screen.
    // On a desktop the finder column is sticky, so the tree takes what the
    // viewport has left after the search and the Quickbar beneath it.
    <div className="max-h-[32rem] overflow-y-auto lg:max-h-[calc(100dvh-18rem)]">
      {filterResult?.bestMatch && (
        <div className="mb-2 border-b border-line pb-2">
          <p className="pb-1 text-[0.6875rem] text-text-dim uppercase">{t('market.bestMatch')}</p>
          <ul>{renderItem(filterResult.bestMatch, 0)}</ul>
        </div>
      )}
      <ul>{roots.map((root) => renderGroup(root, 0))}</ul>
    </div>
  );
}

/**
 * Market Browser: find an item (search + Market Group tree, left) and see its
 * live Order Book at the current Location Mode's region (right), read from
 * ESI (ADR 0003). Location Mode (CONTEXT.md round 9) is either Trade Hub
 * (that hub's region, filtered to its station) or Region (the whole region,
 * every station) — a device-local preference like the hub setting it
 * replaces as the sole location control. A globally-traded item (PLEX today)
 * overrides either mode: its own Global Market Region always wins (round
 * 12). The catalogue (groups/types/systems/stations/regions) is lazy-loaded,
 * not precached (CONTEXT.md round 10) — most installs never open /market.
 */
export function Market() {
  const { t } = useTranslation();
  const location = useLocation();
  const [tab, setTab] = usePageTab(MARKET_TABS);
  // Issue #726: true only immediately after the Quickbar's "View in
  // Appraisal" action, so the panel mounts with its Compare Hubs section
  // already open instead of collapsed.
  const [expandCompareOnAppraisal, setExpandCompareOnAppraisal] = useState(false);
  // Hauling's own reload lives in this page's title bar rather than its
  // Panel header (round: hauling header tweaks) — the tab hands the button
  // its click handler and disabled state up through this callback.
  const [haulingRefresh, setHaulingRefresh] = useState<HaulingRefreshInfo | null>(null);
  // `expandCompare` defaults false so every ordinary tab switch clears it —
  // only `handleViewQuickbarInAppraisal` passes `true`, and only that call's
  // own value should reach the next `AppraisalPanel` mount.
  function changeTab(next: MarketTab, expandCompare = false) {
    setTab(next);
    setExpandCompareOnAppraisal(expandCompare);
  }
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The Appraisal tab's other half of the same control pair as the header's hub picker.
  const savedPricePercent = useMarketPricePercent((state) => state.value);
  const hydratePricePercent = useMarketPricePercent((state) => state.hydrate);
  const setPricePercent = useMarketPricePercent((state) => state.setValue);
  useEffect(() => {
    void hydratePricePercent();
  }, [hydratePricePercent]);
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

  // The Quickbar (CONTEXT.md): Editable Data, one record per character. Reads
  // as [] rather than requiring an active character — Market Browser itself
  // needs none — so Add to Quickbar is disabled with nobody active.
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  // Item Actions (issue #2041): every item menu's Quickbar add, Show info (the
  // one Item Detail modal, priced at `orderBookLocation`) and the lazy
  // blueprint catalog behind Build Plan.
  const itemActions = usePageItemActions({ activeCharacterId, lazyBlueprints: true });
  const {
    items: quickbarItems,
    write: writeQuickbar,
    setTarget: handleSetQuickbarTarget,
    pinWithTarget: handlePinWithTarget,
  } = itemActions.quickbar;

  function handleRemoveFromQuickbar(typeId: number) {
    void writeQuickbar(removeQuickbarItem(quickbarItems, typeId));
  }
  function handleReorderQuickbar(activeTypeId: number, overTypeId: number) {
    void writeQuickbar(reorderQuickbarItems(quickbarItems, activeTypeId, overTypeId));
  }

  // Issue #726: sends the Quickbar's contents into Appraisal, landing
  // directly on the multi-hub view (#689) rather than a collapsed one.
  function handleViewQuickbarInAppraisal() {
    appraisal.appraiseText(quickbarToPasteText(quickbarItems));
    changeTab('appraisal', true);
  }

  // Variations "Compare" (issue #146, folded into the Compare drawer's
  // Attributes view by #1425): adds every row currently shown in the
  // Variations table, plus the selected item itself, to the Compare Set and
  // opens the drawer on Attributes — see CompareAttributesMatrix.
  const addManyToCompare = useCompareSet((state) => state.addMany);
  const removeManyFromCompare = useCompareSet((state) => state.removeMany);
  const openCompareIn = useCompareSet((state) => state.openIn);
  // Issue #1746: the merge can add ~19 rows with no cheap way back out, so
  // the add is followed by an Undo toast that removes exactly those rows.
  const [compareUndo, setCompareUndo] = useState<{
    typeIds: number[];
    count: number;
    itemName: string;
  } | null>(null);
  useTimedToast(compareUndo, () => setCompareUndo(null));
  function handleCompareVariations() {
    if (!variationsResult || !selectedItem || selectedTypeId === null) return;
    const added = addManyToCompare([
      { typeId: selectedTypeId, itemName: selectedItem.name },
      ...variationsResult.rows.map((row) => ({ typeId: row.typeId, itemName: row.name })),
    ]);
    openCompareIn('attributes');
    setCompareUndo(
      added.length > 0 ? { typeIds: added, count: added.length, itemName: selectedItem.name } : null
    );
  }
  function handleUndoCompareVariations() {
    if (!compareUndo) return;
    removeManyFromCompare(compareUndo.typeIds);
    setCompareUndo(null);
  }

  // Narrow screens show one column at a time (CONTEXT.md round 8); matches
  // the grid's own `lg:` breakpoint so the JS-driven visibility and the CSS
  // layout switch at the same width.
  const isDesktop = useIsDesktop();

  const {
    groups,
    types,
    npcStations,
    solarSystems,
    marketRegions,
    catalogueError,
    catalogueLoading,
    retry: retryCatalogue,
    groupsById,
    childrenByParent,
    typesByGroup,
    typesById,
    npcStationMap,
    solarSystemMap,
    allMarketRegionIds,
    systemRegions,
    variationIndex,
  } = useMarketCatalogue();

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
    filterResult,
    handleToggle,
    itemTab,
    setItemTab,
  } = useMarketBrowser({ groups, types, marketRegions, groupsById });

  // Focus management for the finder <-> item panel swap below the `lg:`
  // breakpoint (issue #1485): selecting an item hides the finder and shows
  // the item panel with no focus cue, and Back does the reverse. `enabled:
  // !isDesktop` — see `useFocusHeading`'s own doc comment for why that's a
  // separate param rather than folded into the key.
  const itemHeadingRef = useRef<HTMLHeadingElement>(null);
  useFocusHeading(itemHeadingRef, selectedTypeId, !isDesktop);

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
  const appraisal = useAppraisal(effectiveHub, pricePercent, activeCharacterId);
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
  useSharedAppraisalSeed((text) => appraisal.appraiseText(text));
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
    stationFilter,
    setStationFilter,
    stationFilterLabel,
    browserFilterValue,
    handleBrowserFiltersChange,
    activeFilterCount,
    filtersNarrowBook,
    orderBookFailed,
    regionsUnavailable,
    orderBookView,
    loadedView,
    sortedSell,
    sortedBuy,
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
    catalogueError,
    ensureBlueprintCatalog: itemActions.actions.requestBlueprints,
    npcStations,
    solarSystems,
    marketRegions,
    allMarketRegionIds,
    systemRegions,
    typesByGroup,
    typesById,
    variationIndex,
    npcStationMap,
    solarSystemMap,
    t,
  });

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

  const sellRows = sellShowAll ? sortedSell : sortedSell.slice(0, ROW_CAP);
  const buyRows = buyShowAll ? sortedBuy : sortedBuy.slice(0, ROW_CAP);

  // Every row, not the ROW_CAP the tables mount before "Show all" — hence
  // `source: 'sorted-rows'` (every row, in the order the table is sorted by).
  const sellCsvColumns = useMemo(
    () =>
      orderBookCsvColumns(t, {
        npcStations: npcStationMap,
        solarSystems: solarSystemMap,
        isBuy: false,
      }),
    [t, npcStationMap, solarSystemMap]
  );
  const buyCsvColumns = useMemo(
    () =>
      orderBookCsvColumns(t, {
        npcStations: npcStationMap,
        solarSystems: solarSystemMap,
        isBuy: true,
      }),
    [t, npcStationMap, solarSystemMap]
  );
  const sellExport = useTableExport({
    surface: 'market-sell',
    rows: sortedSell,
    columns: sellCsvColumns,
    truncated: loadedView?.truncated ?? false,
    source: 'sorted-rows',
  });
  const buyExport = useTableExport({
    surface: 'market-buy',
    rows: sortedBuy,
    columns: buyCsvColumns,
    truncated: loadedView?.truncated ?? false,
    source: 'sorted-rows',
  });

  // The order book's own width picks columns or two-line cards: a phone,
  // and a desktop whose finder column leaves the book too narrow for the
  // columns the pilot has picked and the figures on screen, both get the
  // card. Short of that, Location narrows first, so fewer widths need cards.
  const isPhone = useIsPhone();
  const bookBestSell = loadedView?.summary.bestSell ?? null;
  const orderBookWidths = orderBookWidthsRem(
    useVisibleMarketOrderColumns((state) => state.value),
    orderBookFigureChars([...sellRows, ...buyRows], bookBestSell)
  );
  const [orderBookRef, [orderLocationSqueezed = false, orderBookNarrow = false]] =
    useElementNarrowerThan<HTMLDivElement>([orderBookWidths.roomy, orderBookWidths.cards]);
  const orderCards = isPhone || orderBookNarrow;

  const { itemSkills, trainedSkills, targetPlan } = useOrderRowSkills(
    selectedTypeId,
    activeCharacterId
  );

  const {
    visibleOrderColumns,
    toggleOrderColumn,
    orderColumnsById,
    baseColumns,
    buyColumns,
    sellHiddenColumns,
    buyHiddenColumns,
  } = useMarketOrderColumns({
    t,
    npcStationMap,
    solarSystemMap,
    myOrderIds,
    jumpRangeFilter,
    bestSell: loadedView?.summary.bestSell ?? null,
    cards: orderCards,
    locationSqueezed: orderLocationSqueezed,
  });
  // A phone shows one side of the book at a time (`BookSideToggle`).
  const [phoneSide, setPhoneSide] = useState<BookSide>('sell');

  function handleRefresh() {
    // On Appraisal the button re-prices the pasted list instead, dropping the
    // Fuzzwork TTL for those types only (`invalidateHubPrices`). Nothing
    // below applies: there is no selected item and no order book on this tab.
    if (tab === 'appraisal') {
      appraisal.refresh();
      return;
    }
    // A failed catalogue load leaves no item to select, so Refresh retries
    // the catalogue itself, the one recovery this page has short of F5.
    if (catalogueError) {
      retryCatalogue();
      return;
    }
    refreshOrderBook();
  }

  function orderRowClassName(order: RegionOrder) {
    return myOrderIds.has(order.order_id) ? 'row-mine' : undefined;
  }

  function orderRowContextMenu(order: RegionOrder, tr: ReactElement) {
    return (
      <OrderRowContextMenu
        order={order}
        trigger={tr}
        npcStations={npcStationMap}
        solarSystems={solarSystemMap}
        onFilterToStation={setStationFilter}
        typeId={selectedTypeId ?? 0}
        itemName={selectedItem?.name ?? ''}
      />
    );
  }

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

  // The header's hub or region, as the Distance select's "no range" option:
  // with no range set, that is what the book reads.
  const scopeLabel =
    effectiveLocation.mode === 'hub'
      ? effectiveHub.systemName
      : allRegions
        ? t('market.allRegions')
        : (marketRegions?.find((region) => region.id === chosenRegionId)?.name ?? hubRegionName);
  const browserFilterBarProps = {
    value: browserFilterValue,
    onChange: handleBrowserFiltersChange,
    activeCount: activeFilterCount,
    regionMode,
    scopeLabel,
    currentSystem,
  };

  // What the scope bar says the book is reading. Distances are known at every
  // range, so the hub's own distance shows even with no range set.
  const knownJumps = jumpRangeFilter.jumpsStatus === 'ready' ? jumpRangeFilter.jumps : null;
  const bookStationCount = new Set([...sortedSell, ...sortedBuy].map((o) => o.location_id)).size;
  const bookScope: OrderBookScope =
    rangeAcross && browserFilterValue.jumps !== 'any'
      ? { kind: 'range', jumps: browserFilterValue.jumps, stationCount: bookStationCount }
      : effectiveLocation.mode === 'hub'
        ? {
            kind: 'station',
            stationName: npcStationMap.get(effectiveHub.stationId)?.name ?? effectiveHub.systemName,
            systemId: effectiveHub.systemId,
            security: solarSystemMap.get(effectiveHub.systemId)?.security ?? null,
            jumpsAway: knownJumps?.get(effectiveHub.systemId) ?? null,
          }
        : { kind: 'region', regionName: scopeLabel, stationCount: bookStationCount };
  // Where the per-item prices beside the book (the hub comparison, the
  // Variations rows) are read: `orderBookLocation`, which is one region even
  // under All regions — the hub's — so it is named as that, not "All regions".
  const priceScopeName = allRegions ? hubRegionName : scopeLabel;
  // What still reads the header's hub or region while the book reaches past it.
  const scopeNote = allRegions
    ? t('market.allRegionsSecondaryNote', { regionName: hubRegionName })
    : rangeAcross
      ? t('market.rangeSecondaryNote', { scope: scopeLabel })
      : null;

  const itemTabs = (
    <Tabs
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
      {/* The Browser takes the width a wide screen has — a two-column finder
          and order book wasted half a 1440px monitor at 6xl — while the
          other tabs keep their reading width. */}
      <div className={`mx-auto space-y-4 ${tab === 'browser' ? 'max-w-[96rem]' : 'max-w-6xl'}`}>
        <PageHeader
          title={t('market.title')}
          actions={
            usesHubPicker(tab) ? (
              <>
                {/* The mode chip and the picker next to it printed the same words
                  twice — "TRADE HUB · REGION · TRADE HUB [Jita]". The selected chip
                  *is* the picker's label, so the picker keeps the string as its
                  `aria-label` only: still announced, no longer duplicated on
                  screen.

                  Browser only: see `usesHubPicker`. Appraisal prices at a
                  station, so it has no Region mode to toggle into. */}
                {tab === 'browser' && (
                  <div role="group" aria-label={t('market.locationMode')} className="flex gap-2">
                    <FilterChip
                      label={t('market.modeHub')}
                      selected={effectiveLocation.mode === 'hub'}
                      onToggle={() => handleModeChange('hub')}
                    />
                    <FilterChip
                      label={t('market.modeRegion')}
                      selected={effectiveLocation.mode === 'region'}
                      onToggle={() => handleModeChange('region')}
                    />
                  </div>
                )}
                {effectiveLocation.mode === 'hub' || tab === 'appraisal' ? (
                  <Select
                    value={effectiveHub.id}
                    onValueChange={(value) => handleHubChange(value as TradeHub['id'])}
                  >
                    <SelectTrigger
                      size="sm"
                      aria-label={t('market.tradeHub')}
                      className="w-32 sm:w-44"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRADE_HUBS.map((h) => (
                        <SelectItem key={h.id} value={h.id}>
                          {h.systemName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  // "All regions" (`null` to the picker) fans the selected item's
                  // book out over every region; see `allRegionsFetchKey`.
                  <RegionSelect
                    size="sm"
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
                <IconButton
                  size="sm"
                  icon={<Icon.Refresh />}
                  label={t('market.refresh')}
                  onClick={handleRefresh}
                  // Section-aware: on the Browser this re-reads the selected
                  // item's order book, on Appraisal it re-prices the pasted
                  // list. Both are "refresh what is on screen", and neither has
                  // anything to do until there *is* something on screen.
                  disabled={
                    tab === 'appraisal'
                      ? appraisal.result === null || appraisal.loading
                      : !catalogueError && (selectedTypeId === null || orderBookLoading)
                  }
                />
              </>
            ) : tab === 'hauling' && haulingRefresh ? (
              <IconButton
                size="sm"
                icon={<Icon.Refresh />}
                label={t('market.refresh')}
                onClick={haulingRefresh.refresh}
                disabled={haulingRefresh.disabled}
              />
            ) : undefined
          }
        />

        <Tabs
          label={t('market.title')}
          value={isHistoryView(tab) ? 'history' : tab}
          // Clicking History while already inside it would otherwise throw away
          // the chosen view and snap back to the orders one.
          onChange={(id) => {
            if (id === 'history' && isHistoryView(tab)) return;
            changeTab(id as MarketTab);
          }}
          tabs={[
            { id: 'browser', label: t('market.sections.browser') },
            { id: 'orders', label: t('market.sections.openOrders') },
            { id: 'history', label: t('market.sections.history') },
            { id: 'appraisal', label: t('market.sections.appraisal') },
            { id: 'hauling', label: t('market.sections.hauling') },
          ]}
        />

        {tab === 'orders' && <OpenOrdersPanel />}

        {tab === 'history' && (
          <OrderHistoryPanel
            onViewChange={(view) =>
              changeTab(view === 'transactions' ? 'history/transactions' : 'history')
            }
          />
        )}
        {tab === 'history/transactions' && (
          <TransactionsPanel
            onViewChange={(view) =>
              changeTab(view === 'transactions' ? 'history/transactions' : 'history')
            }
          />
        )}

        {/* The list itself lives in `useAppraisal` at route level, so switching
          to the Browser and back does not throw away a forty-line paste. */}
        {tab === 'appraisal' && (
          <AppraisalPanel
            controller={appraisal}
            pricePercent={pricePercent}
            onPricePercentChange={handlePricePercentChange}
            hub={effectiveHub}
            standing={tradeHubStanding(tradeHubStandings, effectiveHub.id)}
            characterId={activeCharacterId}
            defaultCompareExpanded={expandCompareOnAppraisal}
          />
        )}

        {tab === 'hauling' && <HaulingPanel onRefreshInfoChange={setHaulingRefresh} />}

        {tab === 'browser' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr] lg:items-start">
            <Panel
              ref={finderPanelRef}
              // Sticky beside a long order book, so the search stays in reach
              // while the book scrolls.
              className={isDesktop || selectedTypeId === null ? 'lg:sticky lg:top-4' : 'hidden'}
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

              {query.trim().length > 0 && query.trim().length < MARKET_TREE_MIN_QUERY_LENGTH && (
                <p className="pt-2 text-[0.6875rem] text-text-dim uppercase">
                  {t('market.searchTooShort', { min: MARKET_TREE_MIN_QUERY_LENGTH })}
                </p>
              )}

              {filterResult?.capped && (
                <p className="pt-2 text-[0.6875rem] text-warning uppercase">
                  {t('market.searchCapped', {
                    limit: MARKET_TREE_MATCH_LIMIT,
                    total: filterResult.totalMatches,
                  })}
                </p>
              )}

              {catalogueError ? (
                <EmptyState
                  title={t('market.loadFailedTitle')}
                  hint={t('market.loadFailedHint')}
                  className="py-8"
                />
              ) : catalogueLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner label={t('common.loading')} />
                </div>
              ) : filterResult &&
                filterResult.visibleGroupIds.size === 0 &&
                !filterResult.bestMatch ? (
                <EmptyState title={t('market.noResults')} className="py-8" />
              ) : (
                <div className="mt-3 border-t border-line pt-2">
                  <MarketGroupTree
                    groups={groups ?? []}
                    childrenByParent={childrenByParent}
                    typesByGroup={typesByGroup}
                    filterResult={filterResult}
                    expandedIds={expandedIds}
                    searchCollapsedIds={searchCollapsedIds}
                    onToggle={handleToggle}
                    onSelect={handleSelectItem}
                    selectedTypeId={selectedTypeId}
                  />
                </div>
              )}

              <QuickbarList
                items={quickbarItems}
                selectedTypeId={selectedTypeId}
                onSelect={handleSelectItem}
                onRemove={handleRemoveFromQuickbar}
                onReorder={handleReorderQuickbar}
                onSetTarget={handleSetQuickbarTarget}
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
              meta={
                selectedItem &&
                selectedTypeId !== null && (
                  <span className="flex flex-wrap items-center gap-1 max-md:shrink-0 max-md:flex-nowrap">
                    <ItemPriceAlertBell
                      typeId={selectedTypeId}
                      name={selectedItem.name}
                      item={quickbarItems.find((i) => i.typeId === selectedTypeId)}
                      disabled={activeCharacterId === null}
                      onPin={handlePinWithTarget}
                    />
                    <IconButton
                      size="sm"
                      icon={<Icon.Info />}
                      label={t('market.contextMenu.showInfo')}
                      onClick={() =>
                        itemActions.actions.showInfo(selectedTypeId, selectedItem.name)
                      }
                    />
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
                    activeCount={activeFilterCount}
                    regionMode={regionMode}
                    scopeLabel={scopeLabel}
                    currentSystem={currentSystem}
                    note={scopeNote}
                  />
                  {itemTabs}
                  {itemTab === 'history' ? (
                    resolvedRegion && (
                      <PriceHistoryPanel
                        regionId={resolvedRegion.regionId}
                        typeId={selectedTypeId}
                        itemName={selectedItem?.name ?? ''}
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
                    <div className="flex justify-center py-8">
                      <Spinner label={t('common.loading')} />
                    </div>
                  ) : orderBookFailed ? (
                    // Not the empty book: ESI didn't answer (a 420, or the Error
                    // Budget declining to send), which says nothing about who
                    // trades the item — so no "nobody is selling" copy and no
                    // blueprint BPC hint, just the failure and a way to retry.
                    <EmptyState
                      title={t('market.orderBookFailedTitle')}
                      hint={t('market.orderBookFailedHint')}
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
                            <p role="status" className="text-warning">
                              {t('market.regionsFailed', { count: failedRegionCount })}
                            </p>
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
                          <Button size="sm" onClick={() => setStationFilter(null)}>
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
                          stationName={
                            effectiveLocation.mode === 'hub'
                              ? (npcStationMap.get(effectiveHub.stationId)?.name ?? null)
                              : null
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
                        sellCount={sortedSell.length}
                        buyCount={sortedBuy.length}
                        bestSell={loadedView?.summary.bestSell ?? null}
                        bestBuy={loadedView?.summary.bestBuy ?? null}
                      />
                      <OrderSideCard
                        side="sell"
                        rows={sellRows}
                        total={sortedSell.length}
                        best={loadedView?.summary.bestSell ?? null}
                        columns={baseColumns}
                        availableColumns={SELL_ORDER_COLUMN_IDS}
                        visibleColumns={visibleOrderColumns}
                        columnsById={orderColumnsById}
                        onToggleColumn={toggleOrderColumn}
                        tableExport={sellExport}
                        hiddenOnPhone={phoneSide !== 'sell'}
                        cards={orderCards}
                        onShowAll={
                          !sellShowAll && sortedSell.length > ROW_CAP
                            ? () => setSellShowAll(true)
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
                            onFilterToStation={stationFilter === null ? setStationFilter : null}
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
                        rows={buyRows}
                        total={sortedBuy.length}
                        best={loadedView?.summary.bestBuy ?? null}
                        columns={buyColumns}
                        availableColumns={BUY_ORDER_COLUMN_IDS}
                        visibleColumns={visibleOrderColumns}
                        columnsById={orderColumnsById}
                        onToggleColumn={toggleOrderColumn}
                        tableExport={buyExport}
                        hiddenOnPhone={phoneSide !== 'buy'}
                        cards={orderCards}
                        onShowAll={
                          !buyShowAll && sortedBuy.length > ROW_CAP
                            ? () => setBuyShowAll(true)
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
                            onFilterToStation={stationFilter === null ? setStationFilter : null}
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
                </div>
              )}
            </Panel>
          </div>
        )}

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

        {compareUndo && (
          <Toast
            message={t('market.compareUndo.added', {
              count: compareUndo.count,
              name: compareUndo.itemName,
            })}
            undo={{ label: t('market.compareUndo.undo'), onUndo: handleUndoCompareVariations }}
          />
        )}
      </div>
    </ItemActionsProvider>
  );
}
