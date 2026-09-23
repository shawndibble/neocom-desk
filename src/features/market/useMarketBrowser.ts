/**
 * The Market Browser's selection and location: which item and which
 * region/hub the URL names, the device's persisted Trade Hub/Location Mode
 * preferences, and the Market Group tree's own search/expand state.
 *
 * The selected item and the current location are read from the URL
 * (CONTEXT.md round 7, issue #4), not held in component state: the query
 * string is the single source of truth, so a shared link and the browser's
 * own back/forward both just work. A parsed id that doesn't (yet, or ever)
 * resolve against the loaded catalogue falls back to the default view rather
 * than erroring — the catalogue slices still being null (first load) is
 * treated as "not yet known to be invalid", not "invalid".
 *
 * This also backs the page header's hub/region picker (`usesHubPicker`),
 * which renders above the tab body and applies to the Appraisal tab too — so
 * `Market.tsx` reads this hook's output even while another tab is showing,
 * the same reason `useAppraisal` is held at route level.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUrlParam } from '@/lib/useUrlState';
import { enumParam, type UrlParamCodec } from '@/lib/urlState';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { useMarketHub } from '@/features/market/hub';
import { useLocationMode, type LocationMode } from '@/features/market/locationMode';
import {
  filterMarketTree,
  addAncestors,
  type MarketTreeFilterResult,
} from '@/features/market/marketTree';
import { ALL_REGIONS, type RegionChoice } from '@/engine/market/locationMode';
import {
  parseMarketParams,
  buildMarketParams,
  resolveAgainstCatalogue,
  resolveMarketLocation,
  type MarketLocationParam,
} from '@/engine/market/urlState';
import type { MarketGroupNode, MarketTypeEntry, MarketRegionEntry } from '@/sde/marketTypes';

/** Tree search, in the URL (ADR 0015) scoped to the Browser tab. */
const BROWSER_SEARCH_PARAM: UrlParamCodec<string> = {
  parse: (raw) => raw ?? '',
  serialize: (value) => (value === '' ? null : value),
};

const ITEM_TAB_PARAM = enumParam(['orders', 'history'] as const, 'orders');

export interface UseMarketBrowserArgs {
  groups: MarketGroupNode[] | null;
  types: MarketTypeEntry[] | null;
  marketRegions: MarketRegionEntry[] | null;
  groupsById: ReadonlyMap<number, MarketGroupNode>;
}

export interface MarketBrowserController {
  selectedTypeId: number | null;
  selectedItem: MarketTypeEntry | null;

  effectiveLocation: MarketLocationParam;
  effectiveHub: TradeHub;
  allRegions: boolean;
  chosenRegionId: number;
  hubHydrated: boolean;
  locationModeHydrated: boolean;
  hubId: TradeHub['id'];

  handleModeChange: (mode: LocationMode) => void;
  handleHubChange: (id: TradeHub['id']) => void;
  handleRegionChange: (regionId: RegionChoice) => void;
  handleSelectItem: (typeId: number) => void;
  handleBackToFinder: () => void;

  query: string;
  setQuery: (next: string) => void;
  expandedIds: ReadonlySet<number>;
  searchCollapsedIds: ReadonlySet<number>;
  filterResult: MarketTreeFilterResult | null;
  handleToggle: (groupId: number) => void;

  /** Market Data / Price History (issue #11) — Market Data by default. */
  itemTab: 'orders' | 'history';
  setItemTab: (next: 'orders' | 'history') => void;
}

export function useMarketBrowser({
  groups,
  types,
  marketRegions,
  groupsById,
}: UseMarketBrowserArgs): MarketBrowserController {
  const [searchParams, setSearchParams] = useSearchParams();

  const hubId = useMarketHub((state) => state.value);
  const hubHydrated = useMarketHub((state) => state.hydrated);
  const hydrateHub = useMarketHub((state) => state.hydrate);
  const setHubId = useMarketHub((state) => state.setValue);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const locationModeValue = useLocationMode((state) => state.value);
  const locationModeHydrated = useLocationMode((state) => state.hydrated);
  const hydrateLocationMode = useLocationMode((state) => state.hydrate);
  const setLocationModeValue = useLocationMode((state) => state.setValue);

  // Tree search, in the URL (ADR 0015) scoped to the Browser tab — a reload
  // or a shared link reopens the same search rather than an empty tree.
  const [query, setQuery] = useUrlParam('browser.q', BROWSER_SEARCH_PARAM);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(new Set());
  // Groups the user has explicitly collapsed while a search is filtering the
  // tree (see MarketGroupTree's `expanded` calc) — kept apart from
  // `expandedIds` (the plain-browsing expand state) so clearing the search
  // returns to whatever the tree looked like before it started.
  const [searchCollapsedIds, setSearchCollapsedIds] = useState<ReadonlySet<number>>(new Set());

  const [itemTab, setItemTab] = useUrlParam('browser.itemTab', ITEM_TAB_PARAM);

  // Split from the page's `hydratePricePercent` call (Market.tsx) — that one
  // belongs to Appraisal, not the Browser/location state this hook owns. Two
  // separate effects that each fire once on mount behave identically to the
  // one they used to share.
  useEffect(() => {
    void hydrateHub();
    void hydrateLocationMode();
  }, [hydrateHub, hydrateLocationMode]);

  const parsedParams = useMemo(
    () => parseMarketParams((key) => searchParams.get(key)),
    [searchParams]
  );

  // Cross-page item links (MarketItemLink, ImplantChip, ItemContextMenu's
  // "View in Market") now land on `/market/browser?type=...` directly
  // (`engine/market/urlState.ts`'s `marketItemUrl`) — tab is a path segment,
  // so there is no longer a "which tab is this?" ambiguity for a click that
  // means "browse this item" to paper over.
  const typeIsValid = resolveAgainstCatalogue(
    parsedParams.typeId,
    types,
    (ty, id) => ty.typeId === id
  );
  const selectedTypeId = parsedParams.typeId !== null && typeIsValid ? parsedParams.typeId : null;
  const selectedItem = types?.find((ty) => ty.typeId === selectedTypeId) ?? null;

  const groupIdIsValid =
    parsedParams.groupId === null
      ? false
      : groups === null
        ? true
        : groupsById.has(parsedParams.groupId);
  const linkedGroupId = groupIdIsValid ? parsedParams.groupId : null;

  // A `?group=` cross-link lands the tree pre-expanded to that category,
  // additive to whatever's already open, once per incoming id — a ref, not
  // state, since a manual re-collapse afterwards must not be fought back open.
  const expandedForGroupId = useRef<number | null>(null);
  useEffect(() => {
    if (groups === null || linkedGroupId === null || linkedGroupId === expandedForGroupId.current) {
      return;
    }
    const ancestry = new Set<number>();
    addAncestors(linkedGroupId, groupsById, ancestry);
    setExpandedIds((prev) => new Set([...prev, ...ancestry]));
    expandedForGroupId.current = linkedGroupId;
  }, [groups, linkedGroupId, groupsById]);

  // All regions needs no catalogue check — it names every region there is.
  const regionIsValid =
    parsedParams.regionId === ALL_REGIONS
      ? true
      : resolveAgainstCatalogue(parsedParams.regionId, marketRegions, (r, id) => r.id === id);
  // A hub id is a small static set (`TRADE_HUBS`), so unlike the region
  // catalogue there's no loading window to be optimistic about.
  const hubIsValid =
    parsedParams.hubId !== null && getTradeHub(parsedParams.hubId as TradeHub['id']) !== undefined;

  // Whichever of region/hub the URL names wins, falling back to the
  // device-local Location Mode preference when neither param resolves.
  const fallbackLocation: MarketLocationParam = useMemo(
    () =>
      locationModeValue.mode === 'region'
        ? { mode: 'region', regionId: locationModeValue.regionId ?? hub.regionId }
        : { mode: 'hub', hubId: hub.id },
    [locationModeValue, hub]
  );
  const effectiveLocation: MarketLocationParam = useMemo(
    () =>
      resolveMarketLocation(
        parsedParams,
        { region: regionIsValid, hub: hubIsValid },
        fallbackLocation
      ),
    [parsedParams, regionIsValid, hubIsValid, fallbackLocation]
  );
  const effectiveHub =
    effectiveLocation.mode === 'hub'
      ? (getTradeHub(effectiveLocation.hubId as TradeHub['id']) ?? hub)
      : hub;

  // All regions (Region mode over every Market Region) fans out only for the
  // selected item's own book. Everything else that reads one region —
  // Variations, Compare, Item Detail, Price History — reads the Trade Hub's
  // region instead, so `chosenRegionId` is always one real region.
  const allRegions =
    effectiveLocation.mode === 'region' && effectiveLocation.regionId === ALL_REGIONS;
  const chosenRegionId =
    effectiveLocation.mode === 'region' && effectiveLocation.regionId !== ALL_REGIONS
      ? effectiveLocation.regionId
      : effectiveHub.regionId;

  // Catches the device's persisted Location Mode up to a valid URL override.
  // `buildMarketParams` only ever writes one of `hub`/`region` at a time, so
  // a URL-supplied hub is dropped from the query string the moment the mode
  // toggles to Region — without this, toggling back to Trade Hub would have
  // nothing left to read and would fall back to whatever hub was persisted
  // before the link was opened, silently abandoning what the link pointed
  // at. `effectiveLocation`/`effectiveHub` still read the URL directly for
  // the render that shows the link's own view, so this is purely about what
  // survives a later, unrelated interaction.
  useEffect(() => {
    if (!hubHydrated || !locationModeHydrated) return;
    if (hubIsValid && parsedParams.hubId !== null && parsedParams.hubId !== hubId) {
      void setHubId(parsedParams.hubId as TradeHub['id']);
    }
    if (
      regionIsValid &&
      parsedParams.regionId !== null &&
      (locationModeValue.mode !== 'region' || locationModeValue.regionId !== parsedParams.regionId)
    ) {
      void setLocationModeValue({ mode: 'region', regionId: parsedParams.regionId });
    }
  }, [
    parsedParams,
    hubIsValid,
    regionIsValid,
    hubId,
    locationModeValue,
    hubHydrated,
    locationModeHydrated,
    setHubId,
    setLocationModeValue,
  ]);

  const filterResult = useMemo(
    () => (groups && types ? filterMarketTree(groups, types, query) : null),
    [groups, types, query]
  );

  function handleToggle(groupId: number) {
    const setter = filterResult !== null ? setSearchCollapsedIds : setExpandedIds;
    setter((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  // Every handler that changes the selected item or the location writes the
  // persisted device setting (unchanged) *and* pushes the new query string,
  // as its own history entry, so a URL grabbed right after matches what's on
  // screen and the browser's back/forward walks through prior selections.
  //
  // `buildMarketParams` returns the canonical type/hub/region set, and
  // replacing those wholesale is the point — `group` goes with them (a
  // one-shot cross-link param, never re-applied once acted on). `browser.station`
  // goes too: every call here means a new item or location, which is exactly
  // when the "filter to this station" banner should clear (previously done by
  // `setStationFilter(null)` in the resetKey effect below — moved here because
  // that call and this one are two independent `useUrlParams` writers landing
  // in the very same render, and the second one silently dropped the first's
  // write, per the "two writers, same tick" hazard `useUrlState.ts` documents).
  // `browser.q`/`browser.itemTab` survive untouched: the tab lives in the path
  // now, not here, so there is no longer a `?section=` this needs to carry along.
  function navigateTo(typeId: number | null, next: MarketLocationParam) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete('type');
      params.delete('hub');
      params.delete('region');
      params.delete('group');
      params.delete('browser.station');
      for (const [key, value] of Object.entries(buildMarketParams(typeId, next))) {
        params.set(key, value);
      }
      return params;
    });
  }

  function handleModeChange(mode: LocationMode) {
    if (mode === effectiveLocation.mode) return;
    // Toggling off a URL-supplied location keeps *that* hub/region, not the
    // device's persisted default — otherwise a shared `?hub=amarr` link
    // reverts to the visitor's own Jita default the instant they touch the
    // toggle, which isn't "restores exactly what the sender saw" anymore.
    const regionId = locationModeValue.regionId ?? effectiveHub.regionId;
    void setLocationModeValue({ mode, regionId });
    navigateTo(
      selectedTypeId,
      mode === 'region' ? { mode: 'region', regionId } : { mode: 'hub', hubId: effectiveHub.id }
    );
  }

  function handleHubChange(id: TradeHub['id']) {
    void setHubId(id);
    navigateTo(selectedTypeId, { mode: 'hub', hubId: id });
  }

  function handleRegionChange(regionId: RegionChoice) {
    void setLocationModeValue({ mode: 'region', regionId });
    navigateTo(selectedTypeId, { mode: 'region', regionId });
  }

  function handleSelectItem(typeId: number) {
    navigateTo(typeId, effectiveLocation);
  }

  function handleBackToFinder() {
    navigateTo(null, effectiveLocation);
  }

  return {
    selectedTypeId,
    selectedItem,
    effectiveLocation,
    effectiveHub,
    allRegions,
    chosenRegionId,
    hubHydrated,
    locationModeHydrated,
    hubId,
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
  };
}
