import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { usePageTab } from '@/lib/usePageTab';
import { MARKET_TABS } from '@/app/pageTabs';
import {
  Button,
  Caret,
  ColumnPickerMenu,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
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
  TextInput,
  TypeIcon,
  RowMoreActions,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import type { MarketOrderColumnId } from '@/features/market/marketOrderColumns';
import * as Icon from '@/components/ui/icons';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { MarketGroupNode, MarketTypeEntry } from '@/sde/marketTypes';
import { TRADE_HUBS, type TradeHub } from '@/market/hubs';
import { SPACE_KINDS } from '@/engine/space';
import type { CurrentSystemState } from '@/features/route/currentSystem';
import {
  JumpRangeSelect,
  CurrentSystemPicker,
  JumpRangeNote,
} from '@/features/route/JumpRangeControls';
import {
  MARKET_TREE_MATCH_LIMIT,
  MARKET_TREE_MIN_QUERY_LENGTH,
  type MarketTreeFilterResult,
} from '@/features/market/marketTree';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useFocusHeading } from '@/lib/useFocusHeading';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { ItemPriceAlertBell } from '@/features/market/ItemPriceAlertBell';
import { OrderRowContextMenu } from '@/features/market/OrderRowContextMenu';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { RequiredSkillsSection } from '@/features/market/RequiredSkillsSection';
import type { RequiredSkill } from '@/features/skills/dogma';
import type { TargetPlan } from '@/features/skills/useTargetPlan';
import type { TrainedSkill } from '@/engine/types';
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
import { useQuickbar } from '@/features/market/useQuickbar';
import {
  resolveOrderLocation,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import { ALL_REGIONS } from '@/engine/market/locationMode';
import type { RegionOrder } from '@/esi/endpoints';
import type { MarketAppraiseState, MarketFocusSearchState } from '@/lib/shortcuts';
import type { BlueprintCatalog } from '@/features/industry/blueprintCatalog';
import { buttonClassName } from '@/components/ui/buttonClassName';
import { downloadCsv } from '@/lib/downloadCsv';
import { orderBookCsvColumns } from '@/features/market/orderBookCsv';
import { OpenOrdersPanel } from '@/features/market/OpenOrdersPanel';
import { OrderHistoryPanel } from '@/features/market/OrderHistoryPanel';
import { TransactionsPanel } from '@/features/market/TransactionsPanel';
import { AppraisalPanel } from '@/features/market/AppraisalPanel';
import { useAppraisal } from '@/features/market/useAppraisal';
import { tradeHubStanding, useTradeHubStandings } from '@/features/market/useTradeHubStandings';
import { useMarketPricePercent } from '@/features/market/pricePercent';
import { bpcSourcingHref } from '@/features/bpcContracts/bpcSourcingUrl';
import { blueprintTypeIdFor, useBlueprintCatalog } from '@/features/market/useBlueprintCatalog';
import { useMarketCatalogue } from '@/features/market/useMarketCatalogue';
import { useMarketBrowser } from '@/features/market/useMarketBrowser';
import {
  useOrderBookOrchestration,
  type BrowserFilterValue,
} from '@/features/market/useOrderBookOrchestration';
import { useOrderRowSkills } from '@/features/market/useOrderRowSkills';
import { useMarketOrderColumns } from '@/features/market/useMarketOrderColumns';
import { SELL_ORDER_COLUMN_IDS, BUY_ORDER_COLUMN_IDS } from '@/features/market/marketOrderColumns';

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

/** Structural, not i18next's TFunction, so this stays easy to pass around without fighting its generics. */
type Translate = (key: string, opts?: Record<string, unknown>) => string;

interface OrderDetailPanelProps {
  order: RegionOrder;
  npcStations: ReadonlyMap<number, NpcStationLookup>;
  solarSystems: ReadonlyMap<number, SolarSystemLookup>;
  /** This table's columns the pilot has hidden via the column picker — shown here instead. */
  hiddenColumns: readonly MarketOrderColumnId[];
  orderColumnsById: Record<MarketOrderColumnId, DataTableColumn<RegionOrder>>;
  itemSkills: {
    typeId: number;
    requiredSkills: RequiredSkill[];
    skillNames: Readonly<Record<number, string>>;
  } | null;
  trainedSkills: ReadonlyMap<number, TrainedSkill>;
  targetPlan: TargetPlan;
  activeCharacterId: number | null;
  itemName: string;
  t: Translate;
}

/**
 * An order row's expand (`DataTable`'s `expandableRow`): whatever this table
 * isn't already showing as a column, plus two facts no column carries at
 * all — a player structure's location isn't the game's own NPC-station
 * network, and this item's skill requirements are the character's, not the
 * order's, but a pilot scanning the book for a seller wants both in the same
 * place rather than a second trip through "Show Info".
 */
function OrderDetailPanel({
  order,
  npcStations,
  solarSystems,
  hiddenColumns,
  orderColumnsById,
  itemSkills,
  trainedSkills,
  targetPlan,
  activeCharacterId,
  itemName,
  t,
}: OrderDetailPanelProps) {
  const location = resolveOrderLocation(order, npcStations, solarSystems);
  const isPlayerStructure = location.stationName === null;
  const skillsLoaded = itemSkills !== null && itemSkills.typeId === order.type_id;
  const hasSkills = skillsLoaded && itemSkills.requiredSkills.length > 0;
  const hasFields = hiddenColumns.length > 0 || isPlayerStructure;

  return (
    <div className="space-y-3">
      {hasFields && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
          {isPlayerStructure && (
            <div>
              <div className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('market.orderDetail.structureType')}
              </div>
              <div className="text-text">{t('market.orderDetail.playerStructure')}</div>
            </div>
          )}
          {hiddenColumns.map((id) => {
            const column = orderColumnsById[id];
            return (
              <div key={id}>
                <div className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {column.header}
                </div>
                <div className="text-text">{column.render(order)}</div>
              </div>
            );
          })}
        </div>
      )}

      {skillsLoaded && hasSkills && (
        <RequiredSkillsSection
          requiredSkills={itemSkills.requiredSkills}
          skillNames={itemSkills.skillNames}
          trainedSkills={trainedSkills}
          target={targetPlan}
          hasCharacter={activeCharacterId !== null}
          itemName={itemName}
        />
      )}

      {!hasFields && skillsLoaded && !hasSkills && (
        <p className="text-xs text-text-dim">{t('market.orderDetail.empty')}</p>
      )}
    </div>
  );
}

/** A Min quantity box's text as a count; blank or junk is no minimum. */
function parseMinQuantity(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

interface BrowserFilterBarProps {
  value: BrowserFilterValue;
  onChange: (next: BrowserFilterValue) => void;
  activeCount: number;
  /** Distance, Security and NPC stations only are Region mode only; Hub mode is one NPC station. */
  regionMode: boolean;
  currentSystem: CurrentSystemState;
  /** The item tabs: the funnel sits at the end of their line rather than a row of its own. */
  leading: ReactNode;
  className?: string;
}

/**
 * The order book's filters behind a funnel, like the other search pages
 * (BPC Sourcing, Courier): collapsed, since the item search that would
 * normally sit beside it lives in the finder column instead.
 */
function BrowserFilterBar({
  value,
  onChange,
  activeCount,
  regionMode,
  currentSystem,
  leading,
  className,
}: BrowserFilterBarProps) {
  const { t } = useTranslation();
  return (
    <FilterBar
      value={value}
      onChange={onChange}
      activeCount={activeCount}
      search={leading}
      className={className}
    >
      {(draft, setDraft) => (
        <>
          {regionMode && (
            <FilterField label={t('jumpRange.label')}>
              <div className="flex flex-wrap items-center gap-2">
                <JumpRangeSelect
                  value={draft.jumps}
                  onChange={(jumps) => setDraft({ ...draft, jumps })}
                />
                <CurrentSystemPicker current={currentSystem} />
              </div>
            </FilterField>
          )}
          <FilterField label={t('market.filterMinQuantity')}>
            <TextInput
              type="number"
              inputMode="numeric"
              min={0}
              aria-label={t('market.filterMinQuantity')}
              placeholder={t('market.filterMinQuantity')}
              className="w-32"
              value={draft.minQty === 0 ? '' : String(draft.minQty)}
              onChange={(event) =>
                setDraft({ ...draft, minQty: parseMinQuantity(event.target.value) })
              }
            />
          </FilterField>
          {regionMode && (
            <div
              role="group"
              aria-label={t('market.filterSecurity')}
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-text-dim">{t('market.filterSecurity')}</span>
              {SPACE_KINDS.map((kind) => (
                <FilterChip
                  key={kind}
                  label={t(`common.spaceOption.${kind}`)}
                  selected={draft.sec.has(kind)}
                  onToggle={() => {
                    const next = new Set(draft.sec);
                    if (next.has(kind)) next.delete(kind);
                    else next.add(kind);
                    setDraft({ ...draft, sec: next });
                  }}
                />
              ))}
            </div>
          )}
          {regionMode && (
            <FilterChip
              label={t('market.filterNpcOnly')}
              selected={draft.npcOnly}
              onToggle={() => setDraft({ ...draft, npcOnly: !draft.npcOnly })}
            />
          )}
        </>
      )}
    </FilterBar>
  );
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
  blueprintCatalog: BlueprintCatalog | null;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
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
  blueprintCatalog,
  onRequestBlueprintCatalog,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
}: MarketGroupTreeProps) {
  const { t } = useTranslation();
  const filtering = filterResult !== null;

  function renderItem(item: MarketTypeEntry, itemDepth: number) {
    const blueprintTypeID = blueprintTypeIdFor(blueprintCatalog, item.typeId);
    return (
      <li key={item.typeId}>
        <ItemContextMenu
          typeId={item.typeId}
          itemName={item.name}
          blueprintTypeID={blueprintTypeID}
          onAddToQuickbar={onAddToQuickbar}
          quickbarAvailable={quickbarAvailable}
          onShowInfo={onShowInfo}
          onOpenChange={(open) => {
            if (open) onRequestBlueprintCatalog();
          }}
        >
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
    <div className="max-h-[32rem] overflow-y-auto">
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
  // `expandCompare` defaults false so every ordinary tab switch clears it —
  // only `handleViewQuickbarInAppraisal` passes `true`, and only that call's
  // own value should reach the next `AppraisalPanel` mount.
  function changeTab(next: MarketTab, expandCompare = false) {
    setTab(next);
    setExpandCompareOnAppraisal(expandCompare);
  }
  const searchInputRef = useRef<HTMLInputElement>(null);

  // The Appraisal tab's other half of the same control pair as the header's hub picker.
  const pricePercent = useMarketPricePercent((state) => state.value);
  const hydratePricePercent = useMarketPricePercent((state) => state.hydrate);
  const setPricePercent = useMarketPricePercent((state) => state.setValue);
  useEffect(() => {
    void hydratePricePercent();
  }, [hydratePricePercent]);

  const compareCount = useCompareSet((state) => state.items.length);

  // The Quickbar (CONTEXT.md): Editable Data, one record per character. Reads
  // as [] rather than requiring an active character — Market Browser itself
  // needs none — so Add to Quickbar silently no-ops with nobody active.
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const {
    items: quickbarItems,
    write: writeQuickbar,
    add: handleAddToQuickbar,
    setTarget: handleSetQuickbarTarget,
    pinWithTarget: handlePinWithTarget,
  } = useQuickbar(activeCharacterId);

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

  // Item Detail (CONTEXT.md round 6): opened from the item context menu
  // (tree/search/Quickbar) or an order row's context menu, both of which
  // only know the target item, not the whole selection state.
  const [infoModalItem, setInfoModalItem] = useState<{ typeId: number; itemName: string } | null>(
    null
  );
  function handleShowInfo(typeId: number, itemName: string) {
    setInfoModalItem({ typeId, itemName });
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
  useEffect(() => {
    if (!compareUndo) return;
    const timer = setTimeout(() => setCompareUndo(null), 8000);
    return () => clearTimeout(timer);
  }, [compareUndo]);
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

  const { blueprintCatalog, ensureBlueprintCatalog } = useBlueprintCatalog();

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

  // The "jump to search" shortcut (`lib/shortcuts.ts`) navigates here with
  // this state to focus the box in one step, from anywhere in the app.
  useEffect(() => {
    if ((location.state as Partial<MarketFocusSearchState> | null)?.focusSearch) {
      searchInputRef.current?.focus();
    }
  }, [location.state]);

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
  // A Fitting's Export menu lands here with its multibuy list to appraise.
  // Keyed on the navigation itself so a re-render never re-submits it.
  const handledAppraiseKey = useRef<string | null>(null);
  useEffect(() => {
    const text = (location.state as Partial<MarketAppraiseState> | null)?.appraiseText;
    if (!text || handledAppraiseKey.current === location.key) return;
    handledAppraiseKey.current = location.key;
    appraisal.appraiseText(text);
  }, [location.key, location.state, appraisal]);
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
    sellShowAll,
    setSellShowAll,
    buyShowAll,
    setBuyShowAll,
    failedRegionCount,
    jumpNoteShown,
    variationsResult,
    variationPrices,
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
    ensureBlueprintCatalog,
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
    selectedTypeId !== null && (blueprintCatalog?.byBlueprintTypeID.has(selectedTypeId) ?? false);

  const sellRows = sellShowAll ? sortedSell : sortedSell.slice(0, ROW_CAP);
  const buyRows = buyShowAll ? sortedBuy : sortedBuy.slice(0, ROW_CAP);

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
  } = useMarketOrderColumns({ t, npcStationMap, solarSystemMap, myOrderIds, jumpRangeFilter });

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
        onShowInfo={handleShowInfo}
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

  const itemTabs = (
    <Tabs
      tabs={[
        { id: 'orders', label: t('market.tabOrders') },
        { id: 'history', label: t('market.tabHistory') },
      ]}
      value={itemTab}
      onChange={(id) => setItemTab(id as 'orders' | 'history')}
      label={t('market.itemTabsLabel')}
      className="min-w-0 flex-1"
    />
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
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
        ]}
      />

      {tab === 'orders' && (
        <OpenOrdersPanel
          blueprintCatalog={blueprintCatalog}
          onRequestBlueprintCatalog={ensureBlueprintCatalog}
          onAddToQuickbar={handleAddToQuickbar}
          quickbarAvailable={activeCharacterId !== null}
          onShowInfo={handleShowInfo}
        />
      )}

      {tab === 'history' && (
        <OrderHistoryPanel
          onViewChange={(view) =>
            changeTab(view === 'transactions' ? 'history/transactions' : 'history')
          }
          blueprintCatalog={blueprintCatalog}
          onRequestBlueprintCatalog={ensureBlueprintCatalog}
          onAddToQuickbar={handleAddToQuickbar}
          quickbarAvailable={activeCharacterId !== null}
          onShowInfo={handleShowInfo}
        />
      )}
      {tab === 'history/transactions' && (
        <TransactionsPanel
          onViewChange={(view) =>
            changeTab(view === 'transactions' ? 'history/transactions' : 'history')
          }
          blueprintCatalog={blueprintCatalog}
          onRequestBlueprintCatalog={ensureBlueprintCatalog}
          onAddToQuickbar={handleAddToQuickbar}
          quickbarAvailable={activeCharacterId !== null}
          onShowInfo={handleShowInfo}
        />
      )}

      {/* The list itself lives in `useAppraisal` at route level, so switching
          to the Browser and back does not throw away a forty-line paste. */}
      {tab === 'appraisal' && (
        <AppraisalPanel
          controller={appraisal}
          pricePercent={pricePercent}
          onPricePercentChange={(value) => void setPricePercent(value)}
          hub={effectiveHub}
          standing={tradeHubStanding(tradeHubStandings, effectiveHub.id)}
          blueprintCatalog={blueprintCatalog}
          onRequestBlueprintCatalog={ensureBlueprintCatalog}
          onAddToQuickbar={handleAddToQuickbar}
          quickbarAvailable={activeCharacterId !== null}
          onShowInfo={handleShowInfo}
          defaultCompareExpanded={expandCompareOnAppraisal}
        />
      )}

      {tab === 'browser' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr] lg:items-start">
          <Panel
            ref={finderPanelRef}
            className={isDesktop || selectedTypeId === null ? '' : 'hidden'}
          >
            <SearchInput
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('market.searchPlaceholder')}
              aria-label={t('market.searchLabel')}
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
                  blueprintCatalog={blueprintCatalog}
                  onRequestBlueprintCatalog={ensureBlueprintCatalog}
                  onAddToQuickbar={handleAddToQuickbar}
                  quickbarAvailable={activeCharacterId !== null}
                  onShowInfo={handleShowInfo}
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
              onAddToQuickbar={handleAddToQuickbar}
              quickbarAvailable={activeCharacterId !== null}
              onShowInfo={handleShowInfo}
              blueprintTypeIdFor={(typeId) => blueprintTypeIdFor(blueprintCatalog, typeId)}
              onRequestBlueprintCatalog={ensureBlueprintCatalog}
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
                <span className="flex flex-wrap items-center gap-1">
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
                    onClick={() => handleShowInfo(selectedTypeId, selectedItem.name)}
                  />
                </span>
              )
            }
            padded={selectedTypeId === null}
            leading={itemPanelLeading}
          >
            {selectedTypeId === null ? (
              <EmptyState
                title={t('market.selectPromptTitle')}
                hint={t('market.selectPromptHint')}
                className="py-8"
              />
            ) : (
              <>
                {itemTab === 'orders' ? (
                  <BrowserFilterBar
                    value={browserFilterValue}
                    onChange={handleBrowserFiltersChange}
                    activeCount={activeFilterCount}
                    regionMode={regionMode}
                    currentSystem={currentSystem}
                    leading={itemTabs}
                    className="px-3 pt-2"
                  />
                ) : (
                  <div className="px-3 pt-2">{itemTabs}</div>
                )}
                {/* Above both tabs: Price History is one of the readers it names. */}
                {allRegions && (
                  <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                    {t('market.allRegionsSecondaryNote', { regionName: hubRegionName })}
                  </p>
                )}
                {itemTab === 'history' ? (
                  resolvedRegion && (
                    <PriceHistoryPanel
                      regionId={resolvedRegion.regionId}
                      typeId={selectedTypeId}
                      itemName={selectedItem?.name ?? ''}
                    />
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
                  <>
                    {resolvedRegion?.override && (
                      <p className="border-b border-line px-3 py-2 text-[0.6875rem] text-text-dim">
                        {t('market.globalMarketNote', {
                          regionName: resolvedRegion.override.regionName,
                        })}
                      </p>
                    )}
                    <div className="divide-y divide-line">
                      {/* Outside the funnel, so a collapsed bar can't hide why a range isn't applying. */}
                      {(jumpNoteShown || failedRegionCount > 0) && (
                        <div className="flex flex-col items-end gap-1 px-3 py-2 text-xs text-text-dim">
                          {jumpNoteShown && <JumpRangeNote status={jumpRangeFilter.status} />}
                          {failedRegionCount > 0 && (
                            <p role="status" className="text-warning">
                              {t('market.regionsFailed', { count: failedRegionCount })}
                            </p>
                          )}
                        </div>
                      )}
                      {stationFilter !== null && (
                        <div className="flex items-center justify-between px-3 py-2 text-xs text-text-dim">
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

                      <div className="pb-3">
                        {/*
                        Each export sits with the table it exports. Both were
                        in the panel header, where — once they became icons —
                        they were two identical download glyphs telling a
                        sighted user nothing apart; only their tooltips
                        differed, and a touch user never sees those. Beside
                        "Sell orders" the same glyph is unambiguous.
                      */}
                        <div className="flex items-center justify-between px-3 pt-3 pb-1">
                          <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                            {t('market.sell')}
                          </h2>
                          <span className="flex items-center gap-1">
                            <ColumnPickerMenu
                              available={SELL_ORDER_COLUMN_IDS}
                              visible={visibleOrderColumns}
                              columnsById={orderColumnsById}
                              onToggle={toggleOrderColumn}
                              buttonLabel={t('market.columnsButton')}
                              menuTitle={t('market.columnsMenuTitle')}
                            />
                            <IconButton
                              size="sm"
                              icon={<Icon.Download />}
                              label={t('market.exportCsvSell')}
                              disabled={sortedSell.length === 0}
                              onClick={() =>
                                downloadCsv(
                                  'market-sell',
                                  sortedSell,
                                  orderBookCsvColumns(t, {
                                    npcStations: npcStationMap,
                                    solarSystems: solarSystemMap,
                                    isBuy: false,
                                  }),
                                  new Date(),
                                  loadedView?.truncated ?? false
                                )
                              }
                            />
                          </span>
                        </div>
                        {sortedSell.length === 0 ? (
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
                              selectedIsBlueprint &&
                              !filtersNarrowBook &&
                              selectedTypeId !== null ? (
                                <Link
                                  to={bpcSourcingHref(selectedTypeId)}
                                  className={buttonClassName({ size: 'sm' })}
                                >
                                  {t('market.searchBpcContracts')}
                                </Link>
                              ) : undefined
                            }
                          />
                        ) : (
                          <>
                            <DataTable
                              columns={baseColumns}
                              rows={sellRows}
                              rowKey={(o) => o.order_id}
                              label={t('market.sell')}
                              defaultSort={{ columnId: 'price', direction: 'asc' }}
                              rowContextMenu={orderRowContextMenu}
                              rowMoreActions
                              rowClassName={(o) =>
                                myOrderIds.has(o.order_id) ? 'row-mine' : undefined
                              }
                              expandableRow={{
                                renderDetail: (o) => (
                                  <OrderDetailPanel
                                    order={o}
                                    npcStations={npcStationMap}
                                    solarSystems={solarSystemMap}
                                    hiddenColumns={sellHiddenColumns}
                                    orderColumnsById={orderColumnsById}
                                    itemSkills={itemSkills}
                                    trainedSkills={trainedSkills}
                                    targetPlan={targetPlan}
                                    activeCharacterId={activeCharacterId}
                                    itemName={selectedItem?.name ?? ''}
                                    t={t}
                                  />
                                ),
                              }}
                            />
                            {!sellShowAll && sortedSell.length > ROW_CAP && (
                              <div className="px-3 py-2">
                                <Button size="sm" onClick={() => setSellShowAll(true)}>
                                  {t('market.showAll', { count: sortedSell.length })}
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <div className="pb-3">
                        <div className="flex items-center justify-between px-3 pt-3 pb-1">
                          <h2 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                            {t('market.buy')}
                          </h2>
                          <span className="flex items-center gap-1">
                            <ColumnPickerMenu
                              available={BUY_ORDER_COLUMN_IDS}
                              visible={visibleOrderColumns}
                              columnsById={orderColumnsById}
                              onToggle={toggleOrderColumn}
                              buttonLabel={t('market.columnsButton')}
                              menuTitle={t('market.columnsMenuTitle')}
                            />
                            <IconButton
                              size="sm"
                              icon={<Icon.Download />}
                              label={t('market.exportCsvBuy')}
                              disabled={sortedBuy.length === 0}
                              onClick={() =>
                                downloadCsv(
                                  'market-buy',
                                  sortedBuy,
                                  orderBookCsvColumns(t, {
                                    npcStations: npcStationMap,
                                    solarSystems: solarSystemMap,
                                    isBuy: true,
                                  }),
                                  new Date(),
                                  loadedView?.truncated ?? false
                                )
                              }
                            />
                          </span>
                        </div>
                        {sortedBuy.length === 0 ? (
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
                        ) : (
                          <>
                            <DataTable
                              columns={buyColumns}
                              rows={buyRows}
                              rowKey={(o) => o.order_id}
                              label={t('market.buy')}
                              defaultSort={{ columnId: 'price', direction: 'desc' }}
                              rowContextMenu={orderRowContextMenu}
                              rowMoreActions
                              rowClassName={(o) =>
                                myOrderIds.has(o.order_id) ? 'row-mine' : undefined
                              }
                              expandableRow={{
                                renderDetail: (o) => (
                                  <OrderDetailPanel
                                    order={o}
                                    npcStations={npcStationMap}
                                    solarSystems={solarSystemMap}
                                    hiddenColumns={buyHiddenColumns}
                                    orderColumnsById={orderColumnsById}
                                    itemSkills={itemSkills}
                                    trainedSkills={trainedSkills}
                                    targetPlan={targetPlan}
                                    activeCharacterId={activeCharacterId}
                                    itemName={selectedItem?.name ?? ''}
                                    t={t}
                                  />
                                ),
                              }}
                            />
                            {!buyShowAll && sortedBuy.length > ROW_CAP && (
                              <div className="px-3 py-2">
                                <Button size="sm" onClick={() => setBuyShowAll(true)}>
                                  {t('market.showAll', { count: sortedBuy.length })}
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/*
                      A gap, so the buy table stops butting straight into the
                      Variations hairline — it reads as one more row block
                      otherwise, not as a separate section.
                    */}
                    {variationsResult && (
                      <div className="mt-3">
                        <VariationsTable
                          rows={variationsResult.rows}
                          prices={variationPrices}
                          onSelect={handleSelectItem}
                          onCompare={handleCompareVariations}
                          blueprintCatalog={blueprintCatalog}
                          onRequestBlueprintCatalog={ensureBlueprintCatalog}
                          onAddToQuickbar={handleAddToQuickbar}
                          quickbarAvailable={activeCharacterId !== null}
                          onShowInfo={handleShowInfo}
                        />
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </Panel>
        </div>
      )}

      {compareCount > 0 && (
        <CompareDrawer
          location={orderBookLocation}
          refreshTick={refreshTick}
          blueprintCatalog={blueprintCatalog}
          onRequestBlueprintCatalog={ensureBlueprintCatalog}
          onAddToQuickbar={handleAddToQuickbar}
          quickbarAvailable={activeCharacterId !== null}
          onShowInfo={handleShowInfo}
          characterId={activeCharacterId}
          hub={effectiveHub}
          standing={tradeHubStanding(tradeHubStandings, effectiveHub.id)}
          sourceLabel={
            effectiveLocation.mode === 'hub'
              ? effectiveHub.systemName
              : (marketRegions?.find((region) => region.id === orderBookLocation.regionId)?.name ??
                hubRegionName)
          }
        />
      )}

      {compareUndo && (
        <div
          role="status"
          className="bg-panel border-line text-text fixed bottom-32 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-md border px-4 py-2 text-sm shadow-lg md:bottom-16"
        >
          <span>
            {t('market.compareUndo.added', {
              count: compareUndo.count,
              name: compareUndo.itemName,
            })}
          </span>
          <button
            type="button"
            className="text-accent font-medium underline"
            onClick={handleUndoCompareVariations}
          >
            {t('market.compareUndo.undo')}
          </button>
        </div>
      )}

      {infoModalItem && (
        <ItemDetailModal
          typeId={infoModalItem.typeId}
          itemName={infoModalItem.itemName}
          location={orderBookLocation}
          onClose={() => setInfoModalItem(null)}
        />
      )}
    </div>
  );
}
