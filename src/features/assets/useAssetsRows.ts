import { useEffect, useMemo, useRef, useState } from 'react';
import { nextDataTableSort } from '@/components/ui';
import type { DataTableSort } from '@/components/ui';
import { splitLevelNodes, sortLevelNodes, type LevelSortColumn } from './assetLevelSort';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { tabPath } from '@/lib/pageTabs';
import type { MarketAppraiseState } from '@/lib/shortcuts';
import { MARKET_TABS } from '@/app/pageTabs';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { placeKey, usePlaceDetails, type PlaceRef } from '@/features/places';
import { useJumpBasis } from '@/features/route/jumpBasis';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { useFocusHeading } from '@/lib/useFocusHeading';
import type { CharacterAsset } from '@/esi/endpoints';
import {
  assetStackValue,
  buildAssetTree,
  collectItemIds,
  collectStationItemIds,
  totalEstimatedValue,
  type AssetTreeNode,
  type AssetTreeStation,
} from '@/engine/assetTree';
import {
  assetNodeSegment,
  indexAssetNodes,
  parseAssetPath,
  resolveAssetPath,
} from '@/engine/assetPath';
import { pruneAssetTree } from '@/engine/assetTreeFilter';
import { assetPassesKindFilter } from '@/features/assets/assetCategoryFilter';
import { useStationSort } from '@/features/assets/stationSortPreference';
import { useAssetSort } from '@/features/assets/assetSortPreference';
import {
  namesForSelection,
  quantityLinesForSelection,
  selectAll,
  toggleSelection,
} from '@/features/assets/assetSelection';
import { hasItemRows } from '@/features/assets/assetBrowserFormat';
import { useAssetRowVirtualizer } from '@/features/assets/useAssetRowVirtualizer';
import {
  baseRowHeight,
  isUnresolvedParent,
  type BrowseRow,
} from '@/features/assets/assetBrowseModel';
import { addQuickbarItem } from '@/features/market/quickbar';
import { writeToClipboard } from '@/lib/clipboard';
import {
  locationLabel,
  matchAssets,
  type ValuedAssetMatch,
  assetHolderChain,
  compareValuedAssetMatches,
  sortStations,
  placeKindForStation,
} from './assetsLogic';
import { type AssetsData } from './useAssetsData';

export function useAssetsRows(assetsData: AssetsData) {
  const {
    activeCharacterId,
    debouncedSearch,
    allItemsView,
    flatModeActive,
    minValueThreshold,
    kindFilter,
    resolvedCrossCharacterFilter,
    crossCharacterCandidates,
    itemActions,
    pins,
    mergedAssets,
    abyssal,
    priceByTypeId,
    itemValueByItemId,
    volumeByTypeId,
    mergedTypeNames,
    mergedLocationNames,
    assetsByItemId,
    assetNames,
    pinStateFor,
  } = assetsData;
  const { t } = useTranslation();
  const navigate = useNavigate();
  const wildcard = useParams()['*'] ?? '';
  const { stationId: pathStationId, segments: pathSegments } = useMemo(
    () => parseAssetPath(wildcard),
    [wildcard]
  );

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  function toggleSelectMode() {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }
  function toggleNodeSelection(ids: readonly number[]) {
    setSelectedIds((prev) => toggleSelection(prev, ids));
  }

  const stationSortField = useStationSort((state) => state.value);
  const setStationSortField = useStationSort((state) => state.setValue);
  useHydratedStore(useStationSort);

  const [routeOverride, setRouteOverride] = useState<RoutePreferenceKind | null>(null);
  const assetsRoute = useJumpBasis(stationSortField === 'jumpsAway' ? routeOverride : null);
  const routePreference = assetsRoute.rules.preference;

  const sortField = useAssetSort((state) => state.value);
  const [levelSort, setLevelSort] = useState<DataTableSort | null>(null);
  function toggleLevelSort(columnId: LevelSortColumn) {
    setLevelSort((prev) => nextDataTableSort(prev, columnId, columnId === 'name' ? 'asc' : 'desc'));
  }
  const setSortField = useAssetSort((state) => state.setValue);
  useHydratedStore(useAssetSort);

  const [characterSystemId, setCharacterSystemId] = useState<number | null>(null);
  const [characterLocationResolved, setCharacterLocationResolved] = useState(false);
  useEffect(() => {
    if (activeCharacterId === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCharacterLocationResolved(false);
    let cancelled = false;
    void loadCharacterSolarSystemId(activeCharacterId).then((systemId) => {
      if (cancelled) return;
      setCharacterSystemId(systemId);
      setCharacterLocationResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [activeCharacterId]);

  const [scopedPlaceRefs, setScopedPlaceRefs] = useState<readonly PlaceRef[]>([]);
  const placeDetails = usePlaceDetails(scopedPlaceRefs, {
    scopeId: activeCharacterId,
    enabled: activeCharacterId !== null,
    origin: { systemId: characterSystemId, resolved: characterLocationResolved },
    basis: assetsRoute,
    names: false,
  });
  const placeDetailFor = (locationId: number) =>
    placeDetails.get(placeKey({ locationId, characterId: activeCharacterId }));
  const jumpsAwayOf = (locationId: number) => placeDetailFor(locationId)?.jumps;

  const fullTree = useMemo(
    () => buildAssetTree(mergedAssets, priceByTypeId, itemValueByItemId),
    [mergedAssets, priceByTypeId, itemValueByItemId]
  );
  const tree = useMemo(
    () =>
      kindFilter || minValueThreshold > 0
        ? pruneAssetTree(
            fullTree,
            (asset) =>
              (!kindFilter || assetPassesKindFilter(asset, kindFilter)) &&
              (minValueThreshold <= 0 ||
                assetStackValue(asset, priceByTypeId, itemValueByItemId) >= minValueThreshold),
            priceByTypeId,
            itemValueByItemId
          )
        : fullTree,
    [fullTree, kindFilter, minValueThreshold, priceByTypeId, itemValueByItemId]
  );
  const stationLabelFor = useMemo(
    () => (station: AssetTreeStation) =>
      locationLabel(
        station.locationId,
        station.locationType,
        mergedLocationNames,
        assetsByItemId,
        mergedTypeNames,
        t
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable from i18next
    [mergedLocationNames, assetsByItemId, mergedTypeNames]
  );
  const sortedTree = useMemo(
    () =>
      sortStations(
        tree,
        stationLabelFor,
        mergedTypeNames,
        (station) => pinStateFor(station.locationId),
        stationSortField,
        (station) =>
          placeDetails.get(
            placeKey({ locationId: station.locationId, characterId: activeCharacterId })
          )?.jumps
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinStateFor closes over pins/activeCharacterId, listed explicitly instead
    [
      tree,
      stationLabelFor,
      mergedTypeNames,
      pins,
      activeCharacterId,
      stationSortField,
      placeDetails,
    ]
  );

  const nodeIndex = useMemo(() => indexAssetNodes(sortedTree), [sortedTree]);
  const totalValue = useMemo(() => totalEstimatedValue(sortedTree), [sortedTree]);
  const showTotalValueChip = !flatModeActive && pathStationId === null && sortedTree.length > 0;
  const totalValueFiltered =
    crossCharacterCandidates.length > 1 &&
    resolvedCrossCharacterFilter !== 'all' &&
    [...resolvedCrossCharacterFilter].length < crossCharacterCandidates.length;

  const resolved = useMemo(
    () => resolveAssetPath(sortedTree, pathStationId, pathSegments),
    [sortedTree, pathStationId, pathSegments]
  );

  function nodeLabel(node: AssetTreeNode): string {
    return node.kind === 'bay'
      ? t(`assets.bay.${node.bay}`)
      : (mergedTypeNames.get(node.asset.type_id) ?? `Type #${node.asset.type_id}`);
  }

  function trailFor(asset: CharacterAsset): string[] {
    const { chain, rootLocationId, rootLocationType } = assetHolderChain(asset, assetsByItemId);
    return [
      locationLabel(
        rootLocationId,
        rootLocationType,
        mergedLocationNames,
        assetsByItemId,
        mergedTypeNames,
        t
      ),
      ...chain.map((parent) => mergedTypeNames.get(parent.type_id) ?? `Type #${parent.type_id}`),
    ];
  }

  function nodePathFor(asset: CharacterAsset) {
    return nodeIndex.get(asset.item_id) ?? null;
  }

  function rootStationIdFor(asset: CharacterAsset): number | null {
    const { rootLocationId, cyclic } = assetHolderChain(asset, assetsByItemId);
    return cyclic ? null : rootLocationId;
  }

  const searchMatches = useMemo(() => {
    if (!flatModeActive) return [];
    if (!allItemsView && debouncedSearch.trim().length === 0) return [];
    return matchAssets(mergedAssets, mergedTypeNames, debouncedSearch, assetNames);
  }, [flatModeActive, allItemsView, mergedAssets, mergedTypeNames, debouncedSearch, assetNames]);
  const flatMatches = useMemo(() => {
    if (!flatModeActive) return [];
    const valued: ValuedAssetMatch[] = searchMatches.map((match) => ({
      match,
      value: assetStackValue(match.asset, priceByTypeId, itemValueByItemId),
    }));
    const filtered =
      minValueThreshold > 0 || kindFilter
        ? valued.filter(
            (v) =>
              v.value >= minValueThreshold &&
              (!kindFilter || assetPassesKindFilter(v.match.asset, kindFilter))
          )
        : valued;
    return filtered.sort((a, b) => compareValuedAssetMatches(a, b, sortField)).map((v) => v.match);
  }, [
    flatModeActive,
    searchMatches,
    minValueThreshold,
    kindFilter,
    priceByTypeId,
    itemValueByItemId,
    sortField,
  ]);

  const rows = useMemo<BrowseRow[]>(() => {
    if (flatModeActive) {
      return flatMatches.map((match) => ({
        kind: 'match' as const,
        key: `m:${match.asset.item_id}`,
        match,
      }));
    }
    if (pathStationId !== null) {
      const { bays, containers, items } = splitLevelNodes(resolved.children);
      const sortedContainers = sortLevelNodes(containers, levelSort, {
        name: (node) => assetNames[node.asset.item_id] ?? nodeLabel(node),
        quantity: (node) => node.itemCount,
        volume: (node) => volumeByTypeId.get(node.asset.type_id),
        value: (node) => node.estimatedValue,
      });
      const sortedItems = sortLevelNodes(items, levelSort, {
        name: (node) => nodeLabel(node),
        quantity: (node) => node.asset.quantity,
        volume: (node) => volumeByTypeId.get(node.asset.type_id),
        value: (node) => assetStackValue(node.asset, priceByTypeId, itemValueByItemId),
      });
      const openable = [...bays, ...sortedContainers];
      const nodeRows = (nodes: readonly AssetTreeNode[]): BrowseRow[] =>
        nodes.map((node) => ({ kind: 'node', key: assetNodeSegment(node), node }));
      const both = openable.length > 0 && sortedItems.length > 0;
      const heading = (key: string, label: string): BrowseRow => ({
        kind: 'heading',
        key,
        label,
        tone: 'default',
      });
      return [
        ...(both ? [heading('h:containers', t('assets.section.shipsAndContainers'))] : []),
        ...nodeRows(openable),
        ...(both ? [heading('h:items', t('assets.section.items'))] : []),
        ...nodeRows(sortedItems),
      ];
    }

    const pinned: BrowseRow[] = [];
    const rest: BrowseRow[] = [];
    const orphans: BrowseRow[] = [];
    for (const station of sortedTree) {
      const row: BrowseRow = {
        kind: 'location',
        key: `l:${station.locationId}`,
        station,
      };
      if (isUnresolvedParent(station, mergedLocationNames)) orphans.push(row);
      else if (pinStateFor(station.locationId) !== 'unpinned') pinned.push(row);
      else rest.push(row);
    }

    const out: BrowseRow[] = [];
    if (pinned.length > 0) {
      out.push({
        kind: 'heading',
        key: 'h:pinned',
        label: t('assets.section.pinned'),
        tone: 'default',
      });
      out.push(...pinned);
    }
    if (rest.length > 0) {
      if (pinned.length > 0) {
        out.push({
          kind: 'heading',
          key: 'h:all',
          label: t('assets.section.allLocations', { count: rest.length }),
          tone: 'default',
        });
      }
      out.push(...rest);
    }
    if (orphans.length > 0) {
      out.push({
        kind: 'heading',
        key: 'h:unresolved',
        label: t('assets.unresolved.heading', { count: orphans.length }),
        tone: 'warning',
      });
      out.push(...orphans);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinStateFor closes over pins/activeCharacterId, listed explicitly; t is stable
  }, [
    flatModeActive,
    flatMatches,
    pathStationId,
    resolved,
    levelSort,
    assetNames,
    volumeByTypeId,
    priceByTypeId,
    itemValueByItemId,
    mergedTypeNames,
    sortedTree,
    pins,
    activeCharacterId,
    mergedLocationNames,
    t,
  ]);

  const showItemColumns = !flatModeActive && pathStationId !== null && hasItemRows(rows);

  const { scrollParentRef, rowVirtualizer } = useAssetRowVirtualizer({
    rows,
    baseRowHeight,
    resetKey: `${wildcard}|${flatModeActive}`,
  });

  const levelHeadingRef = useRef<HTMLHeadingElement>(null);
  const levelKey = `${pathStationId ?? ''}/${pathSegments.join('/')}`;
  useFocusHeading(levelHeadingRef, levelKey);
  const searchRef = useRef<HTMLInputElement>(null);

  const rangeStart = rowVirtualizer.range?.startIndex ?? null;
  const rangeEnd = rowVirtualizer.range?.endIndex ?? null;
  const visibleStationLocationIds = useMemo(() => {
    const ids = new Set<number>();
    if (rangeStart === null || rangeEnd === null) return ids;
    for (let i = rangeStart; i <= rangeEnd; i += 1) {
      const row = rows[i];
      if (row?.kind === 'location') ids.add(row.station.locationId);
    }
    return ids;
  }, [rangeStart, rangeEnd, rows]);

  const jumpsAwayScopedStations = useMemo(() => {
    return sortedTree.filter((station) => {
      if (isUnresolvedParent(station, mergedLocationNames)) return false;
      if (pinStateFor(station.locationId) !== 'unpinned') return true;
      if (visibleStationLocationIds.has(station.locationId)) return true;
      return station.locationId === pathStationId;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinStateFor closes over pins/activeCharacterId, listed explicitly instead
  }, [
    sortedTree,
    visibleStationLocationIds,
    pathStationId,
    pins,
    activeCharacterId,
    mergedLocationNames,
  ]);

  const scopedPlaceRefsNext = jumpsAwayScopedStations.map((station) => ({
    locationId: station.locationId,
    kind: placeKindForStation(station.locationType),
  }));
  const scopedPlaceRefsKey = scopedPlaceRefsNext
    .map((r) => `${r.locationId}:${r.kind ?? ''}`)
    .join(',');
  const [stablePlaceRefsKey, setStablePlaceRefsKey] = useState<string | null>(null);
  if (scopedPlaceRefsKey !== stablePlaceRefsKey) {
    setStablePlaceRefsKey(scopedPlaceRefsKey);
    setScopedPlaceRefs(scopedPlaceRefsNext);
  }

  function securityForStation(locationId: number): number | null | undefined {
    return placeDetailFor(locationId)?.security;
  }

  function handleBulkAddToQuickbar() {
    if (activeCharacterId === null) return;
    let items = itemActions.quickbar.items;
    for (const id of selectedIds) {
      const asset = assetsByItemId.get(id);
      if (!asset || abyssal.isAbyssalType?.(asset.type_id)) continue;
      const name = mergedTypeNames.get(asset.type_id) ?? `Type #${asset.type_id}`;
      items = addQuickbarItem(items, { typeId: asset.type_id, name });
    }
    void itemActions.quickbar.write(items);
  }
  function handleBulkAppraise() {
    const lines = quantityLinesForSelection([...selectedIds], assetsByItemId, mergedTypeNames);
    navigate(tabPath(MARKET_TABS, 'appraisal'), {
      state: { appraiseText: lines.join('\n') } satisfies MarketAppraiseState,
    });
  }
  function handleBulkCopyNames() {
    const names = namesForSelection([...selectedIds], assetsByItemId, mergedTypeNames);
    void writeToClipboard(names.join('\n'));
  }
  function handleBulkCopyWithQuantities() {
    const lines = quantityLinesForSelection([...selectedIds], assetsByItemId, mergedTypeNames);
    void writeToClipboard(lines.join('\n'));
  }

  function collectRowItemIds(): number[] {
    return rows.flatMap((row) => {
      switch (row.kind) {
        case 'match':
          return [row.match.asset.item_id];
        case 'node':
          return collectItemIds(row.node);
        case 'location':
          return collectStationItemIds(row.station);
        case 'heading':
          return [];
      }
    });
  }
  function handleSelectAllInView() {
    setSelectedIds((prev) => selectAll(prev, collectRowItemIds()));
  }
  function handleDeselectAll() {
    setSelectedIds(new Set());
  }

  return {
    levelSort,
    toggleLevelSort,
    pathStationId,
    pathSegments,
    scrollParentRef,
    rowVirtualizer,
    selectMode,
    setSelectMode,
    selectedIds,
    setSelectedIds,
    routeOverride,
    setRouteOverride,
    characterSystemId,
    setCharacterSystemId,
    characterLocationResolved,
    setCharacterLocationResolved,
    scopedPlaceRefs,
    setScopedPlaceRefs,
    stablePlaceRefsKey,
    setStablePlaceRefsKey,
    wildcard,
    assetsRoute,
    routePreference,
    stationSortField,
    setStationSortField,
    sortField,
    setSortField,
    placeDetails,
    placeDetailFor,
    jumpsAwayOf,
    tree,
    stationLabelFor,
    sortedTree,
    totalValue,
    showTotalValueChip,
    totalValueFiltered,
    resolved,
    searchMatches,
    flatMatches,
    rows,
    showItemColumns,
    levelHeadingRef,
    levelKey,
    searchRef,
    rangeStart,
    rangeEnd,
    visibleStationLocationIds,
    jumpsAwayScopedStations,
    scopedPlaceRefsNext,
    scopedPlaceRefsKey,
    toggleSelectMode,
    toggleNodeSelection,
    nodeLabel,
    trailFor,
    nodePathFor,
    rootStationIdFor,
    securityForStation,
    handleBulkAddToQuickbar,
    handleBulkAppraise,
    handleBulkCopyNames,
    handleBulkCopyWithQuantities,
    collectRowItemIds,
    handleSelectAllInView,
    handleDeselectAll,
  };
}

export type AssetsRows = ReturnType<typeof useAssetsRows>;
