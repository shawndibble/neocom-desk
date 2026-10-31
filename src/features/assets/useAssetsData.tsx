import { NO_NAMES, NO_NUMBERS } from '@/lib/emptyCollections';
import { idSetKey } from '@/lib/idSetKey';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { industryTabHref } from '@/features/industry/industryTabs';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import type { EsiEndpointId } from '@/esi/registry';
import { clearStationPin, setAccountStationPin, setCharacterStationPin } from '@/sync';
import { db, type BuildPlanRecord } from '@/db';
import { useCharacters } from '@/features/character/useCharacters';
import { nextPinState, pinStateForStation, type PinState } from '@/features/assets/stationPins';
import {
  useResolvedCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { useRememberedCharacterFilter } from '@/features/character/characterFilterPicks';
import { useViewedCharacterId } from '@/features/character/viewedCharacter';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { useRememberedUrlParams, type RememberedDefaults } from '@/lib/useUrlState';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { boolParam, textParam } from '@/lib/urlState';
import {
  assetPassesKindFilter,
  blueprintKindParam,
  blueprintsTicked,
  categoryPickParam,
  filterIsOpen,
  pickIsAll,
  type AssetKindFilter,
} from '@/features/assets/assetCategoryFilter';
import { useAssetCategoryIndex } from '@/features/assets/useAssetCategoryIndex';
import { useAssetKindPreference } from '@/features/assets/assetKindPreference';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useBlueprintTypeIds } from '@/features/character/useBlueprintTypeIds';
import type { TableExport } from '@/components/ui/useTableExport';
import { usePlaceNicknameMap } from '@/features/assets/placeNicknames';
import { assetCsvRows, assetsCsvColumns, type AssetCsvRow } from '@/features/assets/assetsCsv';
import { withoutAbyssalTypePrices } from '@/engine/market/abyssalValuation';
import { useAbyssalAssetEstimates } from '@/features/abyssal/useAbyssalAssetEstimates';
import { parseIskAmount } from '@/lib/isk';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { assetStackValue } from '@/engine/assetTree';
import {
  type AssetItemActions,
  type AssetMatch,
  type CharacterBadgeContext,
} from '@/features/assets/assetBrowseModel';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { buildPlansByMaterialTypeID } from '@/features/industry/blueprintCatalog';
import {
  loadAssetsSnapshot,
  type CrossCharacterData,
  loadCrossCharacterData,
} from './assetsSnapshot';
import { locationLabel, matchAssets } from './assetsLogic';
import { NO_ASSET_NAMES } from '@/engine/assetNames';

/**
 * Query-string view state (ADR 0015), beside the drill-down path. The
 * cross-character filter's codec joins these in the component, since its
 * default is the synced Settings value.
 */
const SEARCH_PARAM = textParam();
const ALL_ITEMS_PARAM = boolParam();
const MIN_VALUE_PARAM = textParam();
const CATEGORY_PARAM = categoryPickParam();
const ASSETS_VIEW_PARAMS = {
  q: SEARCH_PARAM,
  all: ALL_ITEMS_PARAM,
  min: MIN_VALUE_PARAM,
  cat: CATEGORY_PARAM,
  bp: blueprintKindParam(),
  chars: characterFilterParam('current'),
};

/** Stable identity, so the fallback doesn't invalidate the grouping memo every render. */
const EMPTY_ITEM_OWNERS: ReadonlyMap<number, number> = new Map();
const EMPTY_CHARACTER_NAMES: ReadonlyMap<number, string> = new Map();
export const LOCATION_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterLocation'];
const NO_BUILD_PLANS: readonly BuildPlanRecord[] = [];

export function useAssetsData() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewedCharacterId = useViewedCharacterId();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadAssetsSnapshot,
    viewedCharacterId,
    { cacheKey: 'assets' }
  );

  // Cross-character search (issue #746, replacing issue #85's binary toggle):
  // `'current'` (today's old off-state, no extra fan-out) or `'all'` once the
  // pilot asks via `CharacterFilterControl`. The URL wins; absent, this page's
  // remembered pick, then the synced Settings default. A link's value is never
  // remembered; only a change to the control is.
  const rememberedCharacterFilter = useRememberedCharacterFilter<typeof ASSETS_VIEW_PARAMS>(
    'assets',
    'chars'
  );
  // The Category and Blueprints picks are remembered per device as well
  // (issue #5601); the min-value box stays per-visit, as before.
  const kindPreference = useAssetKindPreference((state) => state.value);
  const kindPreferenceHydrated = useAssetKindPreference((state) => state.hydrated);
  const setKindPreference = useAssetKindPreference((state) => state.setValue);
  useHydratedStore(useAssetKindPreference);
  const remembered = useMemo<RememberedDefaults<typeof ASSETS_VIEW_PARAMS>>(
    () => ({
      values: {
        ...rememberedCharacterFilter.values,
        cat: CATEGORY_PARAM.parse(kindPreference.cat),
        bp: kindPreference.bp,
      },
      remember: (patch) => {
        if (patch.chars !== undefined) rememberedCharacterFilter.remember({ chars: patch.chars });
        if (patch.cat !== undefined || patch.bp !== undefined) {
          void setKindPreference({
            cat: patch.cat === undefined ? kindPreference.cat : CATEGORY_PARAM.serialize(patch.cat),
            bp: patch.bp ?? kindPreference.bp,
          });
        }
      },
    }),
    [rememberedCharacterFilter, kindPreference, setKindPreference]
  );
  const [view, setView] = useRememberedUrlParams(ASSETS_VIEW_PARAMS, remembered);
  const search = view.q;
  const setSearch = (q: string) => setView({ q });
  const searchActive = search.trim().length > 0;
  // Debounced separately from `search` (issue #415): the input stays
  // instantly responsive, only the matching/grouping memos below — which
  // scan every asset — wait out the debounce.
  const [debouncedSearch, setDebouncedSearch] = useDebouncedValue(search);

  // Permanent "all items across all locations" flat view (issue #414): off by
  // default (unpruned tree browsing, as before), and — like search — flattens
  // every location into one sortable list rather than replacing the tree.
  const allItemsView = view.all;
  const minValueInput = view.min;
  const flatModeActive = searchActive || allItemsView;
  // Held off while prices are still loading: every asset values 0 until then.
  const minValueThreshold = data?.pricesReady === false ? 0 : (parseIskAmount(minValueInput) ?? 0);

  // Category and Blueprints (issue #5601): `kindFilter` is null until the
  // market tree has loaded, so a not-yet-known type is never hidden.
  const categoryIndex = useAssetCategoryIndex(data !== undefined && data !== null);
  const catKey = CATEGORY_PARAM.serialize(view.cat);

  const categoryPick = useMemo(() => CATEGORY_PARAM.parse(catKey), [catKey]);
  const blueprintKind = view.bp;
  const showBlueprintSelect = categoryIndex ? blueprintsTicked(categoryIndex, categoryPick) : false;
  const activeFilterCount =
    (pickIsAll(categoryPick) ? 0 : 1) +
    (blueprintKind !== 'any' && showBlueprintSelect ? 1 : 0) +
    (minValueThreshold > 0 ? 1 : 0);
  const resetFilters = () => setView({ cat: 'all', bp: 'any', min: '' });

  // Viewing a named Character is a fixed scope: the cross-Character filter
  // (and its legacy `chars` value, which here named the Character) stands down.
  const crossCharacterFilter: CharacterFilterValue =
    viewedCharacterId === undefined ? view.chars : 'current';
  const resolvedCrossCharacterFilter = useResolvedCharacterFilter(
    crossCharacterFilter,
    activeCharacterId
  );

  const allCharactersQuery = useCharacters();
  const crossCharacterCandidates = useMemo(
    () =>
      allCharactersQuery.map((c) => ({
        characterId: c.characterId,
        characterName: c.name,
      })),
    [allCharactersQuery]
  );
  // The Character a `?char=<id>` link names: the page's fixed subject, so the
  // header names them instead of offering the Character picker.
  const viewedCharacter =
    viewedCharacterId === undefined
      ? undefined
      : allCharactersQuery.find((c) => c.characterId === viewedCharacterId);
  // The active Character's own assets already come from `assetsResult` —
  // this is only ever the *other* Characters the resolved filter names.
  const otherCharacterIds = useMemo(() => {
    const ids =
      resolvedCrossCharacterFilter === 'all'
        ? crossCharacterCandidates.map((c) => c.characterId)
        : [...resolvedCrossCharacterFilter];
    return ids.filter((id) => id !== activeCharacterId);
  }, [resolvedCrossCharacterFilter, crossCharacterCandidates, activeCharacterId]);

  // My ships follows the same Character filter, the active Character included.
  const shipCharacterIds = useMemo(() => {
    const ids =
      resolvedCrossCharacterFilter === 'all'
        ? crossCharacterCandidates.map((c) => c.characterId)
        : [...resolvedCrossCharacterFilter];
    return ids.length === 0 && activeCharacterId !== null ? [activeCharacterId] : ids;
  }, [resolvedCrossCharacterFilter, crossCharacterCandidates, activeCharacterId]);
  const shipsFilterIsAll =
    resolvedCrossCharacterFilter === 'all' ||
    (crossCharacterCandidates.length > 0 &&
      crossCharacterCandidates.every((c) => shipCharacterIds.includes(c.characterId)));

  const [crossCharacterData, setCrossCharacterData] = useState<CrossCharacterData | null>(null);
  const [crossCharacterLoading, setCrossCharacterLoading] = useState(false);
  // Cached per resolved id set (issue #415's per-Character caching, widened to
  // a set): switching the filter away and back to the same set reuses this
  // instead of refetching. A ref, not state — it must survive the resolved
  // set becoming empty (which intentionally leaves `crossCharacterData`
  // itself alone, per the comment below) without itself being a render
  // dependency.
  const crossCharacterCacheRef = useRef<{ key: string; data: CrossCharacterData } | null>(null);
  useEffect(() => {
    if (otherCharacterIds.length === 0 || activeCharacterId === null) return;
    const key = idSetKey(otherCharacterIds);
    if (crossCharacterCacheRef.current?.key === key) {
      setCrossCharacterData(crossCharacterCacheRef.current.data);
      return;
    }
    let cancelled = false;
    void (async () => {
      setCrossCharacterLoading(true);
      try {
        const result = await loadCrossCharacterData(otherCharacterIds);
        if (!cancelled) {
          crossCharacterCacheRef.current = { key, data: result };
          setCrossCharacterData(result);
        }
      } finally {
        if (!cancelled) setCrossCharacterLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [otherCharacterIds, activeCharacterId]);
  // Only reaches beyond the active Character while an actual search is
  // active — resolving the filter to more than "current" alone doesn't
  // change browsing. Narrowed (not a plain boolean) so every memo below gets
  // a non-null value for free.
  const activeCrossCharacterData =
    otherCharacterIds.length > 0 && searchActive ? crossCharacterData : null;

  // Quickbar (GLOSSARY.md), the blueprint catalog for Build Plan, and Show
  // info's modal — the page's shared Item Actions (issue #2041), loaded
  // lazily on the first menu open (same trade-off as the Market Browser: it
  // pulls the full SDE types.json and most page visits never open a menu).
  const itemActions = usePageItemActions({ activeCharacterId, lazyBlueprints: true });

  // Station Pins (issue #84): also Editable Data, synced the same way as the
  // Quickbar. Loaded whole (every Character's pin rows, not just the active
  // one) because an account-wide pin from ANY Character elevates a station
  // regardless of who's active — see pinStateForStation.
  const pinsQuery = useLiveQuery(() => db.stationPins.toArray(), []);
  const pins = pinsQuery ?? [];

  function pinStateFor(locationId: number): PinState {
    return activeCharacterId === null
      ? 'unpinned'
      : pinStateForStation(pins, activeCharacterId, locationId);
  }

  async function handleTogglePin(locationId: number) {
    if (activeCharacterId === null) return;
    const next = nextPinState(pinStateFor(locationId));
    if (next === 'character') await setCharacterStationPin(activeCharacterId, locationId);
    else if (next === 'account') await setAccountStationPin(locationId);
    else await clearStationPin(locationId);
  }

  // "View in Industry as material" (issue #414): the character's own plans,
  // reverse-indexed by the materials their blueprints consume, once the
  // (lazily loaded) blueprint catalog is in hand. Null while unknown, same
  // as the catalog itself, so the menu action stays absent rather than
  // flashing in once the catalog lands.
  const buildPlansQuery = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return db.buildPlans.where('characterId').equals(activeCharacterId).toArray();
  }, [activeCharacterId]);
  const buildPlans = buildPlansQuery ?? NO_BUILD_PLANS;
  const materialPlanMap = useMemo<ReadonlyMap<number, BuildPlanRecord> | null>(
    () =>
      itemActions.actions.blueprints
        ? buildPlansByMaterialTypeID(buildPlans, itemActions.actions.blueprints)
        : null,
    [itemActions.actions.blueprints, buildPlans]
  );
  const handleViewInIndustryAsMaterial = useCallback(
    (typeId: number) => navigate(`${industryTabHref('plans')}?material=${typeId}`),
    [navigate]
  );

  const assetsResult = data?.assetsResult ?? null;
  const assetsTruncated = data?.assetsTruncated ?? false;
  const assetsNeedsReauth = data?.assetsNeedsReauth ?? false;
  const typeNames = data?.typeNames ?? NO_NAMES;
  const locationNames = data?.locationNames ?? NO_NAMES;
  const typePrices = data?.priceByTypeId ?? NO_NUMBERS;
  const ownCopyValues = data?.copyValueByItemId ?? NO_NUMBERS;
  const volumeByTypeId = data?.volumeByTypeId ?? NO_NUMBERS;
  const assetNames = data?.assetNames ?? NO_ASSET_NAMES;

  // On-screen matching: the active Character's own assets, plus every other
  // Character's when the cross-character toggle is on and a search is active
  // (see `activeCrossCharacterData` above) — merging is safe because asset
  // item_ids are globally unique across the whole game, not scoped to one
  // Character.
  const mergedAssets = useMemo(() => {
    const own = assetsResult?.data ?? [];
    if (!activeCrossCharacterData) return own;
    return [...own, ...activeCrossCharacterData.entries.flatMap((entry) => entry.assets)];
  }, [assetsResult, activeCrossCharacterData]);
  // Abyssal types leave the price map; their estimates join the per-item values.
  const abyssal = useAbyssalAssetEstimates(
    mergedAssets,
    (itemId) => activeCrossCharacterData?.characterIdByItemId.get(itemId) ?? activeCharacterId,
    `${activeCharacterId}:${activeCrossCharacterData ? 'all' : 'one'}`
  );
  // The React Compiler is not enabled in this build; it only objects to these
  // two memos' dependency shape, which the hand-written deps get right.

  const priceByTypeId = useMemo(
    () =>
      abyssal.isAbyssalType
        ? withoutAbyssalTypePrices(typePrices, abyssal.isAbyssalType)
        : typePrices,
    [typePrices, abyssal.isAbyssalType]
  );

  const itemValueByItemId = useMemo(() => {
    if (!activeCrossCharacterData && abyssal.values.size === 0) return ownCopyValues;
    return new Map([
      ...ownCopyValues,
      ...(activeCrossCharacterData?.copyValueByItemId ?? []),
      ...abyssal.values,
    ]);
  }, [ownCopyValues, activeCrossCharacterData, abyssal.values]);
  const mergedTypeNames = useMemo(() => {
    if (!activeCrossCharacterData) return typeNames;
    const merged = new Map(typeNames);
    for (const [id, name] of activeCrossCharacterData.typeNames) {
      if (!merged.has(id)) merged.set(id, name);
    }
    return merged;
  }, [typeNames, activeCrossCharacterData]);
  const blueprintTypeIds = useBlueprintTypeIds(mergedTypeNames);

  const kindFilter = useMemo<AssetKindFilter | null>(() => {
    if (!categoryIndex) return null;
    const filter = {
      index: categoryIndex,
      pick: categoryPick,
      blueprints: blueprintKind,
      blueprintTypeIds,
    };
    return filterIsOpen(filter) ? null : filter;
  }, [categoryIndex, categoryPick, blueprintKind, blueprintTypeIds]);
  const mergedLocationNames = useMemo(() => {
    if (!activeCrossCharacterData) return locationNames;
    const merged = new Map(locationNames);
    for (const [id, name] of activeCrossCharacterData.locationNames) {
      if (!merged.has(id)) merged.set(id, name);
    }
    return merged;
  }, [locationNames, activeCrossCharacterData]);
  const characterBadges: CharacterBadgeContext = {
    activeCharacterId,
    idByItemId: activeCrossCharacterData?.characterIdByItemId ?? EMPTY_ITEM_OWNERS,
    nameById: activeCrossCharacterData?.characterNameById ?? EMPTY_CHARACTER_NAMES,
  };

  const assetsByItemId = useMemo(
    () => new Map(mergedAssets.map((asset) => [asset.item_id, asset])),
    [mergedAssets]
  );
  const ownSystemNames = data?.systemNameByLocationId ?? NO_NAMES;
  const mergedSystemNames = useMemo(() => {
    if (!activeCrossCharacterData) return ownSystemNames;
    return new Map([...activeCrossCharacterData.systemNameByLocationId, ...ownSystemNames]);
  }, [ownSystemNames, activeCrossCharacterData]);

  // The export follows the page: what the search, Category, Blueprints and min value leave on
  // screen, including other Characters' assets while a search runs (a Character column says whose).
  //
  // The grouped/sorted rows are built only when the export actually runs
  // (`assetsExport.getRows` below) — matching every asset and locale-sorting
  // on each data/search change was waste for a menu that is rarely opened.
  function buildCsvGroups() {
    const searched = matchAssets(mergedAssets, mergedTypeNames, debouncedSearch, assetNames);
    const matches =
      kindFilter || minValueThreshold > 0
        ? searched.filter(
            (m) =>
              (!kindFilter || assetPassesKindFilter(m.asset, kindFilter)) &&
              (minValueThreshold <= 0 ||
                assetStackValue(m.asset, priceByTypeId, itemValueByItemId) >= minValueThreshold)
          )
        : searched;

    const byLocation = new Map<number, AssetMatch[]>();
    for (const entry of matches) {
      const list = byLocation.get(entry.asset.location_id) ?? [];
      list.push(entry);
      byLocation.set(entry.asset.location_id, list);
    }
    return [...byLocation.entries()]
      .map(([locationId, locationEntries]) => ({
        locationId,
        label: locationLabel(
          locationId,
          locationEntries[0].asset.location_type,
          mergedLocationNames,
          assetsByItemId,
          mergedTypeNames,
          t
        ),
        entries: locationEntries.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  // Not `useTableExport`: this list isn't a DataTable, and `getRows` builds
  // the grouped rows lazily, only when an export actually runs.
  const placeNicknames = usePlaceNicknameMap();
  const assetsCsvColumnList = useMemo(() => assetsCsvColumns(t), [t]);
  const assetsExport: TableExport<AssetCsvRow> = {
    surface: 'assets',
    columns: assetsCsvColumnList,
    truncated: assetsTruncated,
    getRows: () =>
      assetCsvRows(
        buildCsvGroups().map((group) => ({ label: group.label, entries: group.entries })),
        {
          assetsByItemId,
          typeNames: mergedTypeNames,
          gameNames: assetNames,
          locationNames: mergedLocationNames,
          systemNameByLocationId: mergedSystemNames,
          priceByTypeId,
          itemValueByItemId,
          volumeByTypeId,
          blueprintTypeIds,
          placeNicknames,
          characterNameOf: (itemId) => {
            const ownerId = characterBadges.idByItemId.get(itemId) ?? activeCharacterId;
            return (
              crossCharacterCandidates.find((c) => c.characterId === ownerId)?.characterName ?? ''
            );
          },
          t,
        }
      ),
  };

  const assetItemActions = useMemo<AssetItemActions>(
    () => ({
      priceByTypeId,
      itemValueByItemId,
      abyssal,
      volumeByTypeId,
      materialPlanMap,
      onViewInIndustryAsMaterial: handleViewInIndustryAsMaterial,
      blueprintTypeIds,
    }),
    [
      priceByTypeId,
      itemValueByItemId,
      abyssal,
      volumeByTypeId,
      materialPlanMap,
      handleViewInIndustryAsMaterial,
      blueprintTypeIds,
    ]
  );

  return {
    data,
    error,
    loading,
    // Held until the remembered Category pick is read, so the list never flashes unfiltered.
    hydrated: hydrated && kindPreferenceHydrated,
    activeCharacterId,
    refresh,
    placeNicknames,
    view,
    setView,
    debouncedSearch,
    setDebouncedSearch,
    crossCharacterData,
    setCrossCharacterData,
    crossCharacterLoading,
    setCrossCharacterLoading,
    viewedCharacterId,
    rememberedCharacterFilter,
    search,
    setSearch,
    searchActive,
    allItemsView,
    minValueInput,
    flatModeActive,
    minValueThreshold,
    categoryIndex,
    categoryPick,
    blueprintKind,
    kindFilter,
    showBlueprintSelect,
    activeFilterCount,
    resetFilters,
    crossCharacterFilter,
    resolvedCrossCharacterFilter,
    allCharactersQuery,
    crossCharacterCandidates,
    viewedCharacter,
    otherCharacterIds,
    shipCharacterIds,
    shipsFilterIsAll,
    crossCharacterCacheRef,
    activeCrossCharacterData,
    itemActions,
    pinsQuery,
    pins,
    buildPlansQuery,
    buildPlans,
    materialPlanMap,
    handleViewInIndustryAsMaterial,
    assetsResult,
    assetsTruncated,
    assetsNeedsReauth,
    typeNames,
    locationNames,
    typePrices,
    ownCopyValues,
    volumeByTypeId,
    assetNames,
    mergedAssets,
    abyssal,
    priceByTypeId,
    itemValueByItemId,
    mergedTypeNames,
    blueprintTypeIds,
    mergedLocationNames,
    characterBadges,
    assetsByItemId,
    assetsCsvColumnList,
    assetsExport,
    assetItemActions,
    pinStateFor,
    handleTogglePin,
    buildCsvGroups,
  };
}

export type AssetsData = ReturnType<typeof useAssetsData>;
