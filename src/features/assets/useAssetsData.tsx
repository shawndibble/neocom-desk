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
  activeAssetKindFilters,
  assetPassesKindFilter,
  blueprintKindParam,
  blueprintsTicked,
  categoryPickParam,
  pruneCategoryIndex,
  filterIsOpen,
  type AssetKindFilter,
  type BlueprintKind,
  type CategoryPick,
} from '@/features/assets/assetCategoryFilter';
import type { ActiveFilter } from '@/components/ui';
import { useAssetCategoryIndex } from '@/features/assets/useAssetCategoryIndex';
import { useAssetKindPreference } from '@/features/assets/assetKindPreference';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { rootPlaceRefs, useExportSystemNames } from '@/features/assets/assetSystemNames';
import type { PlaceRef } from '@/features/places/types';
import { useBlueprintTypeIds } from '@/features/character/useBlueprintTypeIds';
import type { TableExport } from '@/components/ui/useTableExport';
import { usePlaceNicknameMap } from '@/features/assets/placeNicknames';
import { assetCsvRows, assetsCsvColumns, type AssetCsvRow } from '@/features/assets/assetsCsv';
import { withoutAbyssalTypePrices } from '@/engine/market/abyssalValuation';
import { useAssetAskEstimates } from '@/features/assets/useAssetAskEstimates';
import { useAbyssalAssetEstimates } from '@/features/abyssal/useAbyssalAssetEstimates';
import { formatIskCompact, parseIskAmount } from '@/lib/isk';
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
import { loadStockCostBases, type HeldStockCost } from './stockCostBasis';
import { NO_ASSET_NAMES } from '@/engine/assetNames';
import { useTurnInOffers } from '@/features/campaigns/useTurnIns';
import { useHubFor } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';

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

const EMPTY_ITEM_OWNERS: ReadonlyMap<number, number> = new Map();
const EMPTY_CHARACTER_NAMES: ReadonlyMap<number, string> = new Map();
export const LOCATION_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterLocation'];
const NO_BUILD_PLANS: readonly BuildPlanRecord[] = [];
const NO_PLACE_REFS: readonly PlaceRef[] = [];

export interface AssetsFilterValue {
  cat: CategoryPick;
  bp: BlueprintKind;
  min: string;
}

export function useAssetsData() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewedCharacterId = useViewedCharacterId();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadAssetsSnapshot,
    viewedCharacterId,
    { cacheKey: 'assets' }
  );

  const rememberedCharacterFilter = useRememberedCharacterFilter<typeof ASSETS_VIEW_PARAMS>(
    'assets',
    'chars'
  );
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
  const [debouncedSearch, setDebouncedSearch] = useDebouncedValue(search);

  const allItemsView = view.all;
  const minValueInput = view.min;
  const flatModeActive = searchActive || allItemsView;
  const minValueThreshold = data?.pricesReady === false ? 0 : (parseIskAmount(minValueInput) ?? 0);

  const categoryIndex = useAssetCategoryIndex(data !== undefined && data !== null);
  const catKey = CATEGORY_PARAM.serialize(view.cat);

  const categoryPick = useMemo(() => CATEGORY_PARAM.parse(catKey), [catKey]);
  const blueprintKind = view.bp;

  const resetFilters = () => setView({ cat: 'all', bp: 'any', min: '' });

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
  const viewedCharacter =
    viewedCharacterId === undefined
      ? undefined
      : allCharactersQuery.find((c) => c.characterId === viewedCharacterId);
  const otherCharacterIds = useMemo(() => {
    const ids =
      resolvedCrossCharacterFilter === 'all'
        ? crossCharacterCandidates.map((c) => c.characterId)
        : [...resolvedCrossCharacterFilter];
    return ids.filter((id) => id !== activeCharacterId);
  }, [resolvedCrossCharacterFilter, crossCharacterCandidates, activeCharacterId]);

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
  const activeCrossCharacterData =
    otherCharacterIds.length > 0 && searchActive ? crossCharacterData : null;

  const itemActions = usePageItemActions({ activeCharacterId, lazyBlueprints: true });

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

  const mergedAssets = useMemo(() => {
    const own = assetsResult?.data ?? [];
    if (!activeCrossCharacterData) return own;
    return [...own, ...activeCrossCharacterData.entries.flatMap((entry) => entry.assets)];
  }, [assetsResult, activeCrossCharacterData]);
  const ownAssets = assetsResult?.data;
  const [stockCosts, setStockCosts] = useState<{
    key: string;
    costs: ReadonlyMap<number, HeldStockCost>;
  } | null>(null);
  const stockCostKey =
    activeCharacterId === null ? null : `${activeCharacterId}:${assetsResult?.fetchedAt.getTime()}`;
  useEffect(() => {
    if (activeCharacterId === null || !ownAssets || stockCostKey === null) return;
    let cancelled = false;
    void loadStockCostBases(activeCharacterId, ownAssets)
      .catch(() => new Map<number, HeldStockCost>())
      .then((costs) => {
        if (!cancelled) setStockCosts({ key: stockCostKey, costs });
      });
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId, ownAssets, stockCostKey]);
  const stockCostByTypeId =
    activeCrossCharacterData || stockCosts?.key !== stockCostKey || stockCosts.costs.size === 0
      ? null
      : stockCosts.costs;
  const abyssal = useAbyssalAssetEstimates(
    mergedAssets,
    (itemId) => activeCrossCharacterData?.characterIdByItemId.get(itemId) ?? activeCharacterId,
    `${activeCharacterId}:${activeCrossCharacterData ? 'all' : 'one'}`
  );
  const priceByTypeId = useMemo(
    () =>
      abyssal.isAbyssalType
        ? withoutAbyssalTypePrices(typePrices, abyssal.isAbyssalType)
        : typePrices,
    [typePrices, abyssal.isAbyssalType]
  );

  const askEstimateByTypeId = useAssetAskEstimates(
    mergedAssets,
    priceByTypeId,
    data?.pricesReady !== false,
    abyssal.isAbyssalType
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

  const pickerIndex = useMemo(() => {
    if (!categoryIndex) return null;
    const pruned = pruneCategoryIndex(
      categoryIndex,
      mergedAssets.map((asset) => asset.type_id),
      categoryPick
    );
    return pruned.headings.length > 0 ? pruned : null;
  }, [categoryIndex, mergedAssets, categoryPick]);

  const showBlueprintSelect = pickerIndex ? blueprintsTicked(pickerIndex, categoryPick) : false;
  const filterValue = useMemo<AssetsFilterValue>(
    () => ({ cat: categoryPick, bp: blueprintKind, min: minValueInput }),
    [categoryPick, blueprintKind, minValueInput]
  );
  const activeFilters = useMemo<ActiveFilter<AssetsFilterValue>[]>(() => {
    const active: ActiveFilter<AssetsFilterValue>[] = activeAssetKindFilters(
      filterValue,
      { index: pickerIndex, showBlueprintSelect, categoryLabel: t('assets.category.label') },
      t
    ).map((filter) => ({ ...filter, inline: true }));
    const min = parseIskAmount(filterValue.min) ?? 0;
    if (min > 0)
      active.push({
        label: t('assets.minValue.label'),
        value: t('filters.atLeast', { value: t('filters.isk', { amount: formatIskCompact(min) }) }),
        clear: (next) => ({ ...next, min: '' }),
      });
    return active;
  }, [filterValue, pickerIndex, showBlueprintSelect, t]);
  const activeFilterCount = activeFilters.length;

  const kindFilter = useMemo<AssetKindFilter | null>(() => {
    if (!categoryIndex) return null;
    const filter = {
      index: categoryIndex,
      pick: categoryPick,
      blueprints: showBlueprintSelect ? blueprintKind : 'any',
      blueprintTypeIds,
    };
    return filterIsOpen(filter) ? null : filter;
  }, [categoryIndex, categoryPick, blueprintKind, showBlueprintSelect, blueprintTypeIds]);
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
  const [exportArmed, setExportArmed] = useState(false);
  const systemRefs = useMemo(
    () =>
      exportArmed
        ? rootPlaceRefs(
            mergedAssets,
            mergedLocationNames,
            (itemId) => characterBadges.idByItemId.get(itemId) ?? activeCharacterId
          )
        : NO_PLACE_REFS,
    [exportArmed, mergedAssets, mergedLocationNames, characterBadges.idByItemId, activeCharacterId]
  );
  const systemNames = useExportSystemNames(exportArmed, systemRefs);

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

  const placeNicknames = usePlaceNicknameMap();
  const assetsCsvColumnList = useMemo(() => assetsCsvColumns(t), [t]);
  const assetsExport: TableExport<AssetCsvRow> = {
    surface: 'assets',
    columns: assetsCsvColumnList,
    truncated: assetsTruncated || systemNames.pending,
    onExportIntent: () => setExportArmed(true),
    getRows: () => {
      const characterNames = new Map(
        crossCharacterCandidates.map((c) => [c.characterId, c.characterName])
      );
      return assetCsvRows(buildCsvGroups(), {
        assetsByItemId,
        typeNames: mergedTypeNames,
        gameNames: assetNames,
        locationNames: mergedLocationNames,
        systemNameByLocationId: systemNames.names,
        priceByTypeId,
        itemValueByItemId,
        volumeByTypeId,
        blueprintTypeIds,
        placeNicknames,
        characterNameOf: (itemId) =>
          characterNames.get(characterBadges.idByItemId.get(itemId) ?? activeCharacterId ?? -1) ??
          '',
        t,
      });
    },
  };

  const { hubId: assetsHubId } = useHubFor('assets');
  const turnIns = useTurnInOffers(getTradeHub(assetsHubId) ?? DEFAULT_TRADE_HUB);
  const turnInOffers = turnIns.data;
  const turnInOfferFor = useCallback(
    (typeId: number) => turnInOffers?.offerFor(typeId) ?? null,
    [turnInOffers]
  );

  const assetItemActions = useMemo<AssetItemActions>(
    () => ({
      priceByTypeId,
      itemValueByItemId,
      abyssal,
      askEstimateByTypeId,
      volumeByTypeId,
      stockCostByTypeId,
      materialPlanMap,
      onViewInIndustryAsMaterial: handleViewInIndustryAsMaterial,
      blueprintTypeIds,
      turnInOfferFor,
    }),
    [
      priceByTypeId,
      itemValueByItemId,
      abyssal,
      askEstimateByTypeId,
      volumeByTypeId,
      stockCostByTypeId,
      materialPlanMap,
      handleViewInIndustryAsMaterial,
      blueprintTypeIds,
      turnInOfferFor,
    ]
  );

  return {
    data,
    error,
    loading,
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
    pickerIndex,
    categoryPick,
    blueprintKind,
    kindFilter,
    showBlueprintSelect,
    filterValue,
    activeFilters,
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
    askEstimateByTypeId,
    priceByTypeId,
    pricesReady: data?.pricesReady !== false,
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
