import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { MARKET_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { useRememberedUrlParams, useUrlParam, type UrlParamValues } from '@/lib/useUrlState';
import {
  enumParam,
  orderedIdListParam,
  TEXT_DEBOUNCE_MS,
  type UrlParamCodec,
} from '@/lib/urlState';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { useDeviceMarketHubMigrated } from '@/features/market/browserHub';
import { setPageHubEntry, useHubFor } from '@/features/market/hub';
import { useLocationMode, type LocationMode } from '@/features/market/locationMode';
import {
  filterMarketTree,
  addAncestors,
  summarizeSearchCategories,
  type MarketTreeFilterResult,
  type SearchCategorySummary,
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
import { useHydratedStore } from '@/lib/useHydratedStore';

const BROWSER_SEARCH_KEY = 'browser.q';

const NO_IDS: ReadonlySet<number> = new Set();

export type MarketItemTab = 'orders' | 'variations' | 'history';

const ITEM_TAB_PARAM = enumParam<MarketItemTab>(['orders', 'variations', 'history'], 'orders');

const COMPARE_REGIONS_PARAM = orderedIdListParam();

const LOCATION_PARAMS = {
  hub: {
    parse: (raw) => parseMarketParams((key) => (key === 'hub' ? raw : null)).hubId,
    serialize: (value) => value,
  } satisfies UrlParamCodec<string | null>,
  region: {
    parse: (raw) => parseMarketParams((key) => (key === 'region' ? raw : null)).regionId,
    serialize: (value) => (value === null ? null : String(value)),
  } satisfies UrlParamCodec<RegionChoice | null>,
};
type LocationParams = UrlParamValues<typeof LOCATION_PARAMS>;

function isMarketRegionChoice(
  choice: RegionChoice,
  marketRegions: MarketRegionEntry[] | null
): boolean {
  return (
    choice === ALL_REGIONS || resolveAgainstCatalogue(choice, marketRegions, (r, id) => r.id === id)
  );
}

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

  handleModeChange: (mode: LocationMode) => void;
  handleHubChange: (id: TradeHub['id']) => void;
  handleRegionChange: (regionId: RegionChoice) => void;
  handleSelectItem: (typeId: number) => void;
  handleBackToFinder: () => void;

  query: string;
  setQuery: (next: string) => void;
  expandedIds: ReadonlySet<number>;
  searchCollapsedIds: ReadonlySet<number>;
  searchCategories: SearchCategorySummary | null;
  filterResult: MarketTreeFilterResult | null;
  handleToggle: (groupId: number) => void;

  itemTab: MarketItemTab;
  setItemTab: (next: MarketItemTab) => void;
  compareRegionIds: readonly number[];
  setCompareRegionIds: (next: readonly number[]) => void;
}

const knownLinkedHubRef: { current: string | null } = { current: null };

export function resetKnownLinkedHub(): void {
  knownLinkedHubRef.current = null;
}

export function useMarketBrowser({
  groups,
  types,
  marketRegions,
  groupsById,
}: UseMarketBrowserArgs): MarketBrowserController {
  const [searchParams, setSearchParams] = useSearchParams();

  const migrated = useDeviceMarketHubMigrated();
  const { hubId, hydrated: marketHubHydrated } = useHubFor('market');
  const hubHydrated = marketHubHydrated && migrated;
  const onAppraisal = useLocation().pathname.startsWith(tabPath(MARKET_TABS, 'appraisal'));
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;

  const locationModeValue = useLocationMode((state) => state.value);
  const locationModeHydrated = useHydratedStore(useLocationMode);
  const setLocationModeValue = useLocationMode((state) => state.setValue);

  const urlQuery = searchParams.get(BROWSER_SEARCH_KEY) ?? '';
  const [query, setQueryText] = useState(urlQuery);
  const queryWritten = useRef(urlQuery);
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSearchParams = useRef(searchParams);
  useEffect(() => {
    latestSearchParams.current = searchParams;
  });

  function cancelQueryTimer() {
    if (queryTimer.current !== null) clearTimeout(queryTimer.current);
    queryTimer.current = null;
  }
  useEffect(() => cancelQueryTimer, []);

  useEffect(() => {
    if (urlQuery === queryWritten.current) return;
    queryWritten.current = urlQuery;
    cancelQueryTimer();
    setQueryText(urlQuery);
  }, [urlQuery]);

  function setQuery(next: string) {
    setQueryText(next);
    cancelQueryTimer();
    queryTimer.current = setTimeout(() => {
      queryTimer.current = null;
      queryWritten.current = next;
      const params = new URLSearchParams(latestSearchParams.current);
      if (next === '') params.delete(BROWSER_SEARCH_KEY);
      else params.set(BROWSER_SEARCH_KEY, next);
      setSearchParams(params, { replace: true });
    }, TEXT_DEBOUNCE_MS);
  }
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<number>>(new Set());
  const [searchToggles, setSearchToggles] = useState<{
    query: string;
    ids: ReadonlySet<number>;
  }>({ query: '', ids: new Set() });

  const [itemTab, setItemTab] = useUrlParam('browser.itemTab', ITEM_TAB_PARAM);
  const [compareRegionIds, setCompareRegionIds] = useUrlParam(
    'browser.compare',
    COMPARE_REGIONS_PARAM
  );

  const parsedParams = useMemo(
    () => parseMarketParams((key) => searchParams.get(key)),
    [searchParams]
  );

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

  const rememberedLocation = useMemo(
    () => ({
      values: {
        hub: hubId,
        region: locationModeValue.mode === 'region' ? locationModeValue.regionId : null,
      } satisfies LocationParams,
      hydrated: hubHydrated && locationModeHydrated,
      adoptLinked: !onAppraisal,
      accepts: (key: keyof LocationParams, value: unknown) => {
        if (value === null) return false;
        if (key === 'hub') return getTradeHub(value as TradeHub['id']) !== undefined;
        return isMarketRegionChoice(value as RegionChoice, marketRegions);
      },
      remember: (patch: Partial<LocationParams>) => {
        if (patch.hub && patch.hub !== knownLinkedHubRef.current) {
          knownLinkedHubRef.current = patch.hub;
          void setPageHubEntry('market', patch.hub as TradeHub['id']);
        }
        if (patch.region !== undefined && patch.region !== null) {
          void setLocationModeValue({ mode: 'region', regionId: patch.region });
        }
      },
    }),
    [
      hubId,
      locationModeValue,
      hubHydrated,
      locationModeHydrated,
      marketRegions,
      setLocationModeValue,
      onAppraisal,
    ]
  );
  const [linkedLocation, , isLinked] = useRememberedUrlParams(LOCATION_PARAMS, rememberedLocation);

  const fallbackLocation: MarketLocationParam = useMemo(() => {
    if (locationModeValue.mode !== 'region') return { mode: 'hub', hubId: hub.id };
    const stored = locationModeValue.regionId;
    return {
      mode: 'region',
      regionId:
        stored !== null && isMarketRegionChoice(stored, marketRegions) ? stored : hub.regionId,
    };
  }, [locationModeValue, hub, marketRegions]);
  const regionLinked = isLinked('region');
  const hubLinked = isLinked('hub');
  const effectiveLocation: MarketLocationParam = useMemo(
    () =>
      resolveMarketLocation(
        {
          regionId: regionLinked ? linkedLocation.region : null,
          hubId: hubLinked ? linkedLocation.hub : null,
        },
        { region: regionLinked, hub: hubLinked },
        fallbackLocation
      ),
    [linkedLocation, regionLinked, hubLinked, fallbackLocation]
  );
  const effectiveHub =
    effectiveLocation.mode === 'hub'
      ? (getTradeHub(effectiveLocation.hubId as TradeHub['id']) ?? hub)
      : hub;

  const allRegions =
    effectiveLocation.mode === 'region' && effectiveLocation.regionId === ALL_REGIONS;
  const chosenRegionId =
    effectiveLocation.mode === 'region' && effectiveLocation.regionId !== ALL_REGIONS
      ? effectiveLocation.regionId
      : effectiveHub.regionId;

  const deferredQuery = useDeferredValue(query);
  const filterResult = useMemo(
    () => (groups && types ? filterMarketTree(groups, types, deferredQuery) : null),
    [groups, types, deferredQuery]
  );

  const searchCollapsedIds = searchToggles.query === deferredQuery ? searchToggles.ids : NO_IDS;
  const searchCategories = useMemo(
    () => (filterResult && groupsById ? summarizeSearchCategories(groupsById, filterResult) : null),
    [filterResult, groupsById]
  );

  function handleToggle(groupId: number) {
    const flip = (current: ReadonlySet<number>) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    };
    if (filterResult !== null) {
      setSearchToggles((current) => ({
        query: deferredQuery,
        ids: flip(current.query === deferredQuery ? current.ids : NO_IDS),
      }));
    } else {
      setExpandedIds(flip);
    }
  }

  function navigateTo(typeId: number | null, next: MarketLocationParam) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete('type');
      params.delete('hub');
      params.delete('region');
      params.delete('group');
      params.delete('browser.station');
      cancelQueryTimer();
      queryWritten.current = query;
      if (query === '') params.delete(BROWSER_SEARCH_KEY);
      else params.set(BROWSER_SEARCH_KEY, query);
      for (const [key, value] of Object.entries(buildMarketParams(typeId, next))) {
        params.set(key, value);
      }
      return params;
    });
  }

  function handleModeChange(mode: LocationMode) {
    if (mode === effectiveLocation.mode) return;
    const regionId = locationModeValue.regionId ?? effectiveHub.regionId;
    void setLocationModeValue({ mode, regionId });
    navigateTo(
      selectedTypeId,
      mode === 'region' ? { mode: 'region', regionId } : { mode: 'hub', hubId: effectiveHub.id }
    );
  }

  function handleHubChange(id: TradeHub['id']) {
    knownLinkedHubRef.current = id;
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
  };
}
