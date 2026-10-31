import { useEffect, useMemo, useRef, useState } from 'react';
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

  // Multi-select and bulk actions (issue #90): select mode is off by default and
  // browsing (select mode off) renders exactly as it did before this ticket.
  // Turning select mode off clears the selection rather than merely hiding it.
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

  // Opens on the pilot's Travel default; the picker here changes this view only.
  // It shows only under the Jumps away sort, so a hidden pick never moves a jump count.
  const [routeOverride, setRouteOverride] = useState<RoutePreferenceKind | null>(null);
  const assetsRoute = useJumpBasis(stationSortField === 'jumpsAway' ? routeOverride : null);
  const routePreference = assetsRoute.rules.preference;

  // The flat (search / All Items) list's own sort, remembered the same way the
  // station list's is. Ungated on `hydrated`: this only reorders a list that is
  // already in memory, so the worst a late hydrate does is re-sort it — there
  // is no request to spend on the default first.
  const sortField = useAssetSort((state) => state.value);
  const setSortField = useAssetSort((state) => state.setValue);
  useHydratedStore(useAssetSort);

  // Jumps-away distances (issue #87): the active character's current solar
  // system, fetched once per page load (not polled) via ESI's location
  // endpoint. Re-fetched whenever the active character changes.
  const [characterSystemId, setCharacterSystemId] = useState<number | null>(null);
  const [characterLocationResolved, setCharacterLocationResolved] = useState(false);
  useEffect(() => {
    if (activeCharacterId === null) return;
    // Resets the resolved flag for the newly active character before its fetch.
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

  // Each scoped station's system, security and jumps away: see the effect-free
  // adjust-state-during-render below for which stations. The refs live in state
  // up here because the station sort reads the jumps, and the scoped set is
  // itself derived from that sort.
  const [scopedPlaceRefs, setScopedPlaceRefs] = useState<readonly PlaceRef[]>([]);
  const placeDetails = usePlaceDetails(scopedPlaceRefs, {
    scopeId: activeCharacterId,
    enabled: activeCharacterId !== null,
    origin: { systemId: characterSystemId, resolved: characterLocationResolved },
    basis: assetsRoute,
    // Names come from the page's own bulk lookups.
    names: false,
  });
  const placeDetailFor = (locationId: number) =>
    placeDetails.get(placeKey({ locationId, characterId: activeCharacterId }));
  const jumpsAwayOf = (locationId: number) => placeDetailFor(locationId)?.jumps;

  // The tree is built from every asset: search no longer filters it (results
  // are a separate flat list), so clearing a search never has to rebuild it.
  // Category, Blueprints and min value (issue #5601) prune it afterwards, so a
  // match keeps its container path and every total covers the matches only.
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
  // Root location list only: drilled-in views keep their own node totals, and
  // flat search/all-items mode sums matches rather than the tree. Hidden with no
  // assets (the empty state covers it).
  const showTotalValueChip = !flatModeActive && pathStationId === null && sortedTree.length > 0;
  // A Character filter narrowing below every Character means the figure is not
  // the whole portfolio — flag it so it is never mistaken for one.
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

  /** Ancestor labels for a search hit, outermost first — where this item actually lives. */
  function trailFor(asset: CharacterAsset): string[] {
    const labels: string[] = [];
    let current = asset;
    const seen = new Set<number>([asset.item_id]);
    while (current.location_type === 'item') {
      const parent = assetsByItemId.get(current.location_id);
      if (!parent || seen.has(parent.item_id)) break;
      seen.add(parent.item_id);
      labels.unshift(mergedTypeNames.get(parent.type_id) ?? `Type #${parent.type_id}`);
      current = parent;
    }
    labels.unshift(
      locationLabel(
        current.location_id,
        current.location_type,
        mergedLocationNames,
        assetsByItemId,
        mergedTypeNames,
        t
      )
    );
    return labels;
  }

  /** Where a search hit sits in the drill-down tree; null when the tree does not hold it. */
  function nodePathFor(asset: CharacterAsset) {
    return nodeIndex.get(asset.item_id) ?? null;
  }

  /** The station a search hit belongs to, for the link back into the drill-down. */
  function rootStationIdFor(asset: CharacterAsset): number | null {
    let current = asset;
    const seen = new Set<number>([asset.item_id]);
    while (current.location_type === 'item') {
      const parent = assetsByItemId.get(current.location_id);
      if (!parent) break;
      if (seen.has(parent.item_id)) {
        // A cycle in the asset chain — `current.location_id` points at a node
        // `buildAssetTree`'s cycle guard already absorbed, so no orphan
        // station carries this id. Report unresolved rather than link to a
        // station that doesn't exist.
        return null;
      }
      seen.add(parent.item_id);
      current = parent;
    }
    // We reached a real location, or the chain broke on a missing parent —
    // in which case `buildAssetTree` made that same location_id an orphan
    // group, so it addresses the right row either way.
    return current.location_id;
  }

  // Also requires a non-empty `debouncedSearch` when flat mode is driven by
  // the search box, not just `searchActive`: for up to SEARCH_DEBOUNCE_MS
  // after the first keystroke, `searchActive` (which tracks the
  // instantly-responsive `search`) is already true while `debouncedSearch`
  // is still `''` — `matchAssets` reads an empty query as "match
  // everything", which would otherwise flash the full unfiltered list as
  // "search results" for that one debounce window. The permanent "All
  // items" view (issue #414) has no such flash to guard against — showing
  // everything with no query is its resting state, not a stale debounce —
  // so it skips the guard.
  const searchMatches = useMemo(() => {
    if (!flatModeActive) return [];
    if (!allItemsView && debouncedSearch.trim().length === 0) return [];
    return matchAssets(mergedAssets, mergedTypeNames, debouncedSearch, assetNames);
  }, [flatModeActive, allItemsView, mergedAssets, mergedTypeNames, debouncedSearch, assetNames]);
  // Min-value filter and sort (issue #414) apply to both the search results
  // list and the permanent all-items view — the same flat shape either way.
  // Value is computed once per match up front (not inside the comparator),
  // which both the filter and the sort then reuse.
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

  // The three list shapes, reduced to one row array for one virtualizer.
  const rows = useMemo<BrowseRow[]>(() => {
    if (flatModeActive) {
      return flatMatches.map((match) => ({
        kind: 'match' as const,
        key: `m:${match.asset.item_id}`,
        match,
      }));
    }
    if (pathStationId !== null) {
      return resolved.children.map((node) => ({
        kind: 'node' as const,
        key: assetNodeSegment(node),
        node,
      }));
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
    sortedTree,
    pins,
    activeCharacterId,
    mergedLocationNames,
    t,
  ]);

  // The md+ label strip names the item cells, so it only shows on a level that
  // actually has item rows (not in the location list, and not in flat search
  // results, whose rows are a different shape).
  const showItemColumns = !flatModeActive && pathStationId !== null && hasItemRows(rows);

  const { scrollParentRef, rowVirtualizer } = useAssetRowVirtualizer({
    rows,
    baseRowHeight,
    // Every level change is a different list; keep the new one at the top.
    resetKey: `${wildcard}|${flatModeActive}`,
  });

  // Level-heading focus (issue #1485): a location/container/search-result
  // link, or Back, unmounts the control the pilot just activated — without
  // this, focus falls back to the page body with no cue what happened (WCAG
  // 2.4.3). Keyed on the drill-down path only, not `wildcard` (which also
  // carries the tab segment: arrowing onto Items would pull focus out of the
  // tab strip) and not `flatModeActive` (which flips true the instant a
  // search keystroke lands and would yank focus off the search box).
  // `levelHeadingRef` is shared by whichever of the three header blocks below
  // is actually rendered (root list / drilled level); only one exists at a
  // time.
  const levelHeadingRef = useRef<HTMLHeadingElement>(null);
  const levelKey = `${pathStationId ?? ''}/${pathSegments.join('/')}`;
  useFocusHeading(levelHeadingRef, levelKey);
  const searchRef = useRef<HTMLInputElement>(null);

  // Locations with a row in the virtualizer's current visible range — the
  // "currently visible" half of GLOSSARY.md round 14's "only for pinned and
  // currently visible/expanded stations". Keyed on the range's indices, not
  // `getVirtualItems()`'s array (a fresh reference every render), so this
  // only recomputes when the visible window actually moves.
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

  // Lazy, scoped to pinned locations, locations in the virtualizer's visible
  // range, and the location currently drilled into (GLOSSARY.md round 14:
  // "only for pinned and currently visible/expanded stations") — bounds the
  // route-call fan-out to what's pinned or actually on screen, rather than
  // every station a character owns.
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

  // Narrows the places the hook reads to the station *set*, not the memo
  // above's array identity (issue #415): `pins` is a live Dexie query that gets
  // a new array on every write, including a pin toggle for a station that
  // isn't even in this scoped set. React's sanctioned "adjust state during
  // render" pattern keeps the last reference until the set really changes.
  // A resolved orphan (see isUnresolvedParent) is a structure id in every case
  // seen so far, so it resolves through the same call that named it.
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

  // Bulk actions (issue #90): the three actions the item context menu already
  // offers per row, applied to every selected item_id at once.
  function handleBulkAddToQuickbar() {
    if (activeCharacterId === null) return;
    let items = itemActions.quickbar.items;
    for (const id of selectedIds) {
      const asset = assetsByItemId.get(id);
      // Abyssal: no market; the row menu skips Quickbar too.
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

  /** Every leaf item_id currently in `rows` — whichever of the three list shapes is on screen (issue #415's "Select all in view"). */
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
