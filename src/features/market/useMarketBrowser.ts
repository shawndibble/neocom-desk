/**
 * The Market Browser's selection and location: which item and which
 * region/hub the URL names, the device's persisted Trade Hub/Location Mode
 * preferences, and the Market Group tree's own search/expand state.
 *
 * The selected item and the current location are read from the URL
 * (CONTEXT.md round 7), not held in component state — the query string is
 * the single source of truth, so a shared link and the browser's own
 * back/forward both just work, and it's why `Market.tsx` reads this hook's
 * output at route level even while another tab is showing (this also backs
 * the page header's hub/region picker, `usesHubPicker`, which applies to the
 * Appraisal tab too — same reason `useAppraisal` is held there). A parsed id
 * that doesn't (yet, or ever) resolve against the loaded catalogue falls back
 * to the default view rather than erroring — the catalogue slices still
 * being null (first load) is treated as "not yet known to be invalid", not
 * "invalid".
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRememberedUrlParams, useUrlParam, type UrlParamValues } from '@/lib/useUrlState';
import { enumParam, textParam, type UrlParamCodec } from '@/lib/urlState';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { useMarketBrowserHub } from '@/features/market/browserHub';
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

/**
 * Tree search, in the URL (ADR 0015) scoped to the Browser tab. Debounced:
 * written per keystroke, the navigation lags the box and a fast typist's
 * letters are dropped and the caret jumps to the end.
 */
const BROWSER_SEARCH_PARAM = textParam();

/** The selected item's own views: its Order Book, its Variations, its Price History. */
export type MarketItemTab = 'orders' | 'variations' | 'history';

const ITEM_TAB_PARAM = enumParam<MarketItemTab>(['orders', 'variations', 'history'], 'orders');

/**
 * The URL's `hub`/`region`, read exactly as `parseMarketParams` reads them,
 * as the group `useRememberedUrlParams` blends over the device's own Trade
 * Hub / Location Mode. Written only by `navigateTo`, together with `type`.
 */
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
  filterResult: MarketTreeFilterResult | null;
  handleToggle: (groupId: number) => void;

  /** Order Book / Price History — Order Book by default. */
  itemTab: MarketItemTab;
  setItemTab: (next: MarketItemTab) => void;
}

export function useMarketBrowser({
  groups,
  types,
  marketRegions,
  groupsById,
}: UseMarketBrowserArgs): MarketBrowserController {
  const [searchParams, setSearchParams] = useSearchParams();

  const hubId = useMarketBrowserHub((state) => state.value);
  const hubHydrated = useMarketBrowserHub((state) => state.hydrated);
  const hydrateHub = useMarketBrowserHub((state) => state.hydrate);
  const setHubId = useMarketBrowserHub((state) => state.setValue);
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

  // Separate from Appraisal's `hydratePricePercent` effect (Market.tsx) —
  // different concern; two independent mount-effects behave the same as one.
  useEffect(() => {
    void hydrateHub();
    void hydrateLocationMode();
  }, [hydrateHub, hydrateLocationMode]);

  const parsedParams = useMemo(
    () => parseMarketParams((key) => searchParams.get(key)),
    [searchParams]
  );

  // Cross-page item links (MarketItemLink, ImplantChip, ItemContextMenu's
  // "View in Market") land on `/market/browser?type=...` directly
  // (`engine/market/urlState.ts`'s `marketItemUrl`) — tab is a path segment,
  // so a click that means "browse this item" carries no "which tab is this?"
  // ambiguity to resolve.
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

  /**
   * The device's Trade Hub and Location Mode as the stored default behind the
   * URL's `hub`/`region`. A linked location that names nothing real (a
   * region the catalogue lacks, a hub not in `TRADE_HUBS`) reads as absent.
   *
   * `adoptLinked` is this page's one exception to decision `20260922-221531`
   * (see decision `20260926-201312`): a valid linked hub/region is copied
   * into the device's own setting. `buildMarketParams` only ever writes one
   * of `hub`/`region`, so a linked hub is dropped from the query string the
   * moment the mode toggles to Region — without the copy, toggling back to
   * Trade Hub would fall back to whatever hub was stored before the link was
   * opened, silently abandoning what the link pointed at.
   */
  const rememberedLocation = useMemo(
    () => ({
      values: {
        hub: hubId,
        region: locationModeValue.mode === 'region' ? locationModeValue.regionId : null,
      } satisfies LocationParams,
      hydrated: hubHydrated && locationModeHydrated,
      adoptLinked: true,
      accepts: (key: keyof LocationParams, value: unknown) => {
        if (value === null) return false;
        // A hub id is a small static set (`TRADE_HUBS`), so unlike the region
        // catalogue there's no loading window to be optimistic about.
        if (key === 'hub') return getTradeHub(value as TradeHub['id']) !== undefined;
        // All regions needs no catalogue check — it names every region there is.
        return (
          value === ALL_REGIONS ||
          resolveAgainstCatalogue(value as number, marketRegions, (r, id) => r.id === id)
        );
      },
      remember: (patch: Partial<LocationParams>) => {
        if (patch.hub) void setHubId(patch.hub as TradeHub['id']);
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
      setHubId,
      setLocationModeValue,
    ]
  );
  const [linkedLocation, , isLinked] = useRememberedUrlParams(LOCATION_PARAMS, rememberedLocation);

  // Whichever of region/hub the URL names wins, falling back to the
  // device-local Location Mode preference when neither param resolves.
  const fallbackLocation: MarketLocationParam = useMemo(
    () =>
      locationModeValue.mode === 'region'
        ? { mode: 'region', regionId: locationModeValue.regionId ?? hub.regionId }
        : { mode: 'hub', hubId: hub.id },
    [locationModeValue, hub]
  );
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

  // The tree filters off a deferred copy so a keystroke paints in the box
  // first; the filter and tree render catch up after.
  const deferredQuery = useDeferredValue(query);
  const filterResult = useMemo(
    () => (groups && types ? filterMarketTree(groups, types, deferredQuery) : null),
    [groups, types, deferredQuery]
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
