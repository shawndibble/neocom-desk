import { NO_NAMES, NO_NUMBERS } from '@/lib/emptyCollections';
import { idSetKey } from '@/lib/idSetKey';
import { FromWalletCrumb } from '@/features/netWorth/FromWalletCrumb';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { measureElement, useVirtualizer } from '@tanstack/react-virtual';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { industryTabHref } from '@/features/industry/industryTabs';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
  IconButton,
  IskAmount,
  PageHeader,
  Panel,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  IskInput,
  LiveStatus,
  Tabs,
  TabPanel,
  useTabsId,
  CachedNotice,
} from '@/components/ui';
import { usePageTab } from '@/lib/usePageTab';
import { tabBarTabs, tabPath } from '@/lib/pageTabs';
import type { MarketAppraiseState } from '@/lib/shortcuts';
import { rootFontScale } from '@/lib/fontScale';
import { ASSETS_TABS, MARKET_TABS } from '@/app/pageTabs';
import * as Icon from '@/components/ui/icons';
import type { EsiEndpointId } from '@/esi/registry';
import { GrantBanner, GrantNote } from '@/app/GrantNote';
import { ReauthCachedNote } from '@/app/ReauthCachedNote';
import { clearStationPin, setAccountStationPin, setCharacterStationPin } from '@/sync';
import { db, type BuildPlanRecord } from '@/db';
import { cx } from '@/lib/cx';
import { nextPinState, pinStateForStation, type PinState } from '@/features/character/stationPins';
import {
  loadCharacterAssets,
  loadOtherCharactersAssetsDetailed,
  type SkippedCharacterAssets,
  type OtherCharacterAssets,
} from '@/features/character/assets';
import { MovePlanTab } from '@/features/assets/MovePlanTab';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import {
  useResolvedCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import { useRememberedCharacterFilter } from '@/features/character/characterFilterPicks';
import { useViewedCharacterId } from '@/features/character/viewedCharacter';
import { WalletOriginCrumb } from '@/features/character/WalletOriginCrumb';
import { CharacterScopeReadout } from '@/features/character/CharacterScopeReadout';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { MyShipsView } from '@/features/character/MyShipsView';
import { useRememberedUrlParams } from '@/lib/useUrlState';
import { boolParam, textParam } from '@/lib/urlState';
import type { CachedResult } from '@/esi/cache';
import { loadStationName } from '@/features/character/stations';
import { loadStructureName } from '@/features/character/structures';
import { loadSystemName } from '@/features/character/systemSecurity';
import { loadTypeNames, loadTypeVolumes } from '@/features/character/typeNames';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { placeKey, usePlaceDetails, type PlaceRef } from '@/features/places';
import { useJumpBasis } from '@/features/route/jumpBasis';
import type { RoutePreferenceKind } from '@/engine/route/jumpRoute';
import { ROUTE_PREFERENCE_LABEL_KEYS, ROUTE_PREFERENCES } from '@/features/route/routePreferences';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useFocusHeading } from '@/lib/useFocusHeading';
import { useIsPhone } from '@/lib/useIsPhone';
import type { CharacterAsset } from '@/esi/endpoints';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { loadAssetCopyValues } from '@/features/character/assetCopyValues';
import { useBlueprintTypeIds } from '@/features/character/useBlueprintTypeIds';
import { assetBlueprintKind } from '@/engine/blueprintKind';
import { loadCharacterBlueprints } from '@/features/industry/data';
import { formatAge } from '@/lib/age';
import { TableActionsMenu, TableExportProvider } from '@/components/ui/TableExport';
import type { TableExport } from '@/components/ui/useTableExport';
import { assetCsvRows, assetsCsvColumns, type AssetCsvRow } from '@/features/character/assetsCsv';
import { getAveragePriceByType } from '@/market/prices';
import {
  abyssalItemRefs,
  summarizeAbyssal,
  withoutAbyssalTypePrices,
  type AbyssalSummary,
} from '@/engine/market/abyssalValuation';
import {
  useAbyssalAssetEstimates,
  type AbyssalAssetEstimates,
} from '@/features/abyssal/useAbyssalAssetEstimates';
import { AbyssalValueNote } from '@/features/abyssal/AbyssalValueNote';
import { abyssalValueHint } from '@/features/abyssal/abyssalValueHint';
import { formatIsk, parseIskAmount } from '@/lib/isk';
import {
  assetStackValue,
  buildAssetTree,
  compareStations,
  collectItemIds,
  collectStationItemIds,
  totalEstimatedValue,
  type AssetTreeNode,
  type AssetTreeStation,
  type StationSortField,
} from '@/engine/assetTree';
import {
  assetNodeSegment,
  assetPathHref,
  parseAssetPath,
  resolveAssetPath,
} from '@/engine/assetPath';
import { useStationSort } from '@/features/character/stationSortPreference';
import { useAssetSort, type AssetSortField } from '@/features/character/assetSortPreference';
import {
  namesForSelection,
  quantityLinesForSelection,
  selectAll,
  selectionStateForIds,
  toggleSelection,
} from '@/features/character/assetSelection';
import {
  ContainerRow,
  ItemColumnLabels,
  ItemRow,
  JumpsAwayText,
  LocationRow,
  SearchResultRow,
  SectionHeading,
  SecurityValue,
} from '@/features/character/assetBrowserRows';
import { hasItemRows } from '@/features/character/assetBrowserFormat';
import { OreItemMenu } from '@/features/assets/oreDecision/OreItemMenu';
import { assetShipEditLocation } from '@/features/fittings/assetShipLocation';
import { useOpenInFittings } from '@/features/fittings/useOpenInFittings';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { useItemActions } from '@/features/market/itemActions';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { addQuickbarItem } from '@/features/market/quickbar';
import { writeToClipboard } from '@/lib/clipboard';
import {
  buildPlansByMaterialTypeID,
  planTargetForItem,
} from '@/features/industry/blueprintCatalog';

// Matches Market.tsx's/SkillPicker.tsx's own search debounce — the input stays
// instantly responsive, only the potentially-thousands-of-assets recompute
// below waits out the debounce.
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Query-string view state (ADR 0015), beside the drill-down path. The
 * cross-character filter's codec joins these in the component, since its
 * default is the synced Settings value.
 */
const SEARCH_PARAM = textParam();
const ALL_ITEMS_PARAM = boolParam();
const MIN_VALUE_PARAM = textParam();
const ASSETS_VIEW_PARAMS = {
  q: SEARCH_PARAM,
  all: ALL_ITEMS_PARAM,
  min: MIN_VALUE_PARAM,
  chars: characterFilterParam('current'),
};

/**
 * A drill-down href that keeps the page's whole query string: its filters
 * describe the same view one level deeper, and the component instance (and
 * its state) already survives drill-down.
 */
function assetHref(stationId: number | null, segments: readonly string[], query: string): string {
  return assetPathHref(stationId, segments) + query;
}

const LOCATION_ENDPOINTS: readonly EsiEndpointId[] = ['getCharacterLocation'];
const NO_BUILD_PLANS: readonly BuildPlanRecord[] = [];

interface Snapshot {
  assetsResult: CachedResult<CharacterAsset[]> | null;
  /** Pages were capped or missing — the list below is partial. */
  assetsTruncated: boolean;
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  assetsNeedsReauth: boolean;
  typeNames: Map<number, string>;
  locationNames: Map<number, string>;
  /** Global average market price per type, used for the tree's estimated-value badges. */
  priceByTypeId: Map<number, number>;
  /** Each blueprint copy's own value by item id (`engine/blueprintCopyValue.ts`) — a copy never takes its type's average price. */
  copyValueByItemId: Map<number, number>;
  /** False in an early partial: values read 0 until prices land, so value filters must not apply. */
  pricesReady: boolean;
  /** m3 per unit, from the slim SDE snapshot only — best-effort, missing for market/asset-only types it doesn't cover. */
  volumeByTypeId: Map<number, number>;
}

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function locationLabel(
  locationId: number,
  locationType: CharacterAsset['location_type'],
  locationNames: ReadonlyMap<number, string>,
  assetsByItemId: Map<number, CharacterAsset>,
  typeNames: ReadonlyMap<number, string>,
  t: Translate
): string {
  if (locationType === 'station')
    return locationNames.get(locationId) ?? t('assets.stationLabel', { id: locationId });
  if (locationType === 'other')
    return locationNames.get(locationId) ?? t('assets.structureLabel', { id: locationId });
  if (locationType === 'solar_system') {
    const name = locationNames.get(locationId);
    return name
      ? t('assets.inSpaceNamedLabel', { name })
      : t('assets.inSpaceLabel', { id: locationId });
  }
  if (locationType === 'item') {
    // A missing parent is often actually a structure id ESI never returned as
    // its own asset row (a personal-hangar division inside a player-owned
    // structure, for instance) — `loadAssetsSnapshot` best-effort resolves
    // these via the structures endpoint, so a hit here beats every fallback
    // below.
    const resolvedName = locationNames.get(locationId);
    if (resolvedName) return resolvedName;
    // The parent is another asset (container or ship) in this same list; label
    // the group with ITS resolved type name instead of a raw item id.
    const parent = assetsByItemId.get(locationId);
    if (parent) {
      const parentName = typeNames.get(parent.type_id);
      if (parentName && parentName !== `Type #${parent.type_id}`) return parentName;
    }
    return t('assets.containerLabel');
  }
  // Exhaustiveness fallback: every current location_type is handled above.
  return t('assets.structureLabel', { id: locationId });
}

interface AssetMatch {
  asset: CharacterAsset;
  name: string;
}

/** Name-substring search over a flat asset list, shared by the CSV export path and the on-screen results path. */
function matchAssets(
  assets: readonly CharacterAsset[],
  typeNames: ReadonlyMap<number, string>,
  query: string
): AssetMatch[] {
  const q = query.trim().toLowerCase();
  const matches: AssetMatch[] = [];
  for (const asset of assets) {
    const name = typeNames.get(asset.type_id) ?? `Type #${asset.type_id}`;
    if (q && !name.toLowerCase().includes(q)) continue;
    matches.push({ asset, name });
  }
  return matches;
}

/** An `AssetMatch` with its estimated value precomputed once, rather than re-derived by every sort comparison. */
interface ValuedAssetMatch {
  match: AssetMatch;
  value: number;
}

/** Orders the search/all-items flat list: name ascending, value and quantity highest-first. */
function compareValuedAssetMatches(
  a: ValuedAssetMatch,
  b: ValuedAssetMatch,
  field: AssetSortField
): number {
  switch (field) {
    case 'name':
      return a.match.name.localeCompare(b.match.name);
    case 'value':
      return b.value - a.value;
    case 'quantity':
      return b.match.asset.quantity - a.match.asset.quantity;
  }
}

/** A Character's own blueprint copies valued from contract listings, ME/TE/runs from its blueprints read when that scope is granted. */
function loadOwnCopyValues(
  characterId: number,
  assets: readonly CharacterAsset[]
): Promise<Map<number, number>> {
  return loadAssetCopyValues(
    characterId,
    assets,
    async () => (await loadCharacterBlueprints(characterId)).cached?.data ?? null
  );
}

async function loadAssetsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal<Snapshot>
): Promise<Snapshot> {
  // Not awaited with the assets: a first-ever price read is the slowest call.
  const pricesPromise = getAveragePriceByType();
  const { cached: assetsResult, needsReauth: assetsNeedsReauth } =
    await loadCharacterAssets(characterId);
  const assetsTruncated = assetsResult?.truncated ?? false;
  const assets = assetsResult?.data ?? [];

  // Rows first, the slow reads (prices, Firestore copy values) fill in behind.
  let shown: Snapshot = {
    assetsResult,
    assetsTruncated,
    assetsNeedsReauth,
    typeNames: new Map(),
    locationNames: new Map(),
    priceByTypeId: new Map(),
    pricesReady: false,
    copyValueByItemId: new Map(),
    volumeByTypeId: new Map(),
  };
  const show = (patch: Partial<Snapshot>) => {
    shown = { ...shown, ...patch };
    signal.publish?.(shown);
  };
  show({});
  void pricesPromise.then((priceByTypeId) => show({ priceByTypeId, pricesReady: true }));

  // Already superseded: skip the ESI name resolves, their results would be discarded.
  const typeIds = signal.cancelled ? [] : [...new Set(assets.map((a) => a.type_id))];
  const copyValuesPromise = signal.cancelled
    ? Promise.resolve(new Map<number, number>())
    : loadOwnCopyValues(characterId, assets);
  void copyValuesPromise.then(
    (copyValueByItemId) => show({ copyValueByItemId }),
    () => {}
  );
  const [typeNames, volumeByTypeId] = await Promise.all([
    loadTypeNames(typeIds),
    loadTypeVolumes(typeIds),
  ]);
  show({ typeNames, volumeByTypeId });

  const stationIds = signal.cancelled
    ? []
    : [...new Set(assets.filter((a) => a.location_type === 'station').map((a) => a.location_id))];
  const structureIds = signal.cancelled
    ? []
    : [...new Set(assets.filter((a) => a.location_type === 'other').map((a) => a.location_id))];
  const systemIds = signal.cancelled
    ? []
    : [
        ...new Set(
          assets.filter((a) => a.location_type === 'solar_system').map((a) => a.location_id)
        ),
      ];
  // A `location_type: "item"` asset whose location_id matches no item_id in
  // this same fetch has a parent ESI never returned a row for — most often a
  // personal-hangar division inside a player-owned structure, which the
  // structures endpoint still resolves even though it never appears as its
  // own asset row. Cheap to try (only ever hit once per distinct missing
  // parent) and harmless to miss: an unresolvable id just 403/404s, same as
  // today's silent fallback.
  const itemIds = signal.cancelled ? new Set<number>() : new Set(assets.map((a) => a.item_id));
  const orphanParentIds = signal.cancelled
    ? []
    : [
        ...new Set(
          assets
            .filter((a) => a.location_type === 'item' && !itemIds.has(a.location_id))
            .map((a) => a.location_id)
        ),
      ];
  const [resolvedStations, resolvedStructures, resolvedSystems, resolvedOrphanParents] =
    await Promise.all([
      // Uncapped on purpose: `location_type: 'station'` means every one of
      // these is an NPC station, and those resolve out of the SDE snapshot
      // with no request at all (issue #655), so capping would slow a map
      // lookup down rather than spare ESI anything. It reverts to a request
      // per id only when the snapshot cannot be read — rare, and the fallback
      // is what keeps names working when the file cannot be fetched.
      Promise.all(stationIds.map((id) => loadStationName(id))),
      Promise.all(structureIds.map((id) => loadStructureName(characterId, id))),
      Promise.all(systemIds.map((id) => loadSystemName(id))),
      Promise.all(orphanParentIds.map((id) => loadStructureName(characterId, id))),
    ]);
  const locationNames = new Map<number, string>();
  stationIds.forEach((id, i) => {
    const name = resolvedStations[i];
    if (name) locationNames.set(id, name);
  });
  structureIds.forEach((id, i) => {
    const name = resolvedStructures[i];
    if (name) locationNames.set(id, name);
  });
  systemIds.forEach((id, i) => {
    const name = resolvedSystems[i];
    if (name) locationNames.set(id, name);
  });
  orphanParentIds.forEach((id, i) => {
    const name = resolvedOrphanParents[i];
    if (name) locationNames.set(id, name);
  });

  show({ locationNames });
  const [copyValueByItemId, priceByTypeId] = await Promise.all([copyValuesPromise, pricesPromise]);

  return {
    assetsResult,
    assetsTruncated,
    assetsNeedsReauth,
    typeNames,
    locationNames,
    priceByTypeId,
    pricesReady: true,
    copyValueByItemId,
    volumeByTypeId,
  };
}

/** Everything the cross-character Character filter (issue #746) merges into the active Character's own snapshot. */
interface CrossCharacterData {
  entries: OtherCharacterAssets[];
  typeNames: Map<number, string>;
  locationNames: Map<number, string>;
  /** Owning Character per asset item_id — item ids are globally unique, so this is safe to merge flat across Characters. */
  characterIdByItemId: Map<number, number>;
  characterNameById: Map<number, string>;
  /** Every other Character's blueprint copies, valued the same way as the active one's. */
  copyValueByItemId: Map<number, number>;
  /** Chosen Characters whose assets could not be read: a search here cannot see their items. */
  skipped: SkippedCharacterAssets[];
}

/**
 * Type/location names for every other Character's assets, mirroring
 * `loadAssetsSnapshot`'s own resolution but per-Character for structures:
 * `loadStructureName` is ACL-checked and cached per Character (structures.ts),
 * so a structure must resolve under the Character whose asset actually sits
 * in it, not the active Character running the search.
 */
async function loadCrossCharacterNames(
  entries: readonly OtherCharacterAssets[]
): Promise<{ typeNames: Map<number, string>; locationNames: Map<number, string> }> {
  const allAssets = entries.flatMap((entry) => entry.assets);
  const typeNames = await loadTypeNames(allAssets.map((a) => a.type_id));

  const locationNames = new Map<number, string>();
  const stationIds = [
    ...new Set(allAssets.filter((a) => a.location_type === 'station').map((a) => a.location_id)),
  ];
  // A snapshot lookup per id, not a request per id — see `loadAssetsSnapshot`.
  const resolvedStations = await Promise.all(stationIds.map((id) => loadStationName(id)));
  stationIds.forEach((id, i) => {
    const name = resolvedStations[i];
    if (name) locationNames.set(id, name);
  });

  const systemIds = [
    ...new Set(
      allAssets.filter((a) => a.location_type === 'solar_system').map((a) => a.location_id)
    ),
  ];
  const resolvedSystems = await Promise.all(systemIds.map((id) => loadSystemName(id)));
  systemIds.forEach((id, i) => {
    const name = resolvedSystems[i];
    if (name) locationNames.set(id, name);
  });

  await mapWithConcurrencyLimit(entries, ESI_FANOUT_CONCURRENCY, async (entry) => {
    const structureIds = [
      ...new Set(entry.assets.filter((a) => a.location_type === 'other').map((a) => a.location_id)),
    ];
    await Promise.all(
      structureIds.map(async (id) => {
        const name = await loadStructureName(entry.characterId, id);
        if (name) locationNames.set(id, name);
      })
    );

    // Same best-effort orphan-parent resolution as `loadAssetsSnapshot` — see
    // its comment. Scoped per-entry since a missing parent is ACL-checked
    // under the Character whose asset actually sits there.
    const itemIds = new Set(entry.assets.map((a) => a.item_id));
    const orphanParentIds = [
      ...new Set(
        entry.assets
          .filter((a) => a.location_type === 'item' && !itemIds.has(a.location_id))
          .map((a) => a.location_id)
      ),
    ];
    await Promise.all(
      orphanParentIds.map(async (id) => {
        const name = await loadStructureName(entry.characterId, id);
        if (name) locationNames.set(id, name);
      })
    );
  });

  return { typeNames, locationNames };
}

/** Fetches + resolves everything the cross-character Character filter needs, once per resolved id set. */
async function loadCrossCharacterData(
  otherCharacterIds: readonly number[]
): Promise<CrossCharacterData> {
  const { entries, skipped } = await loadOtherCharactersAssetsDetailed(otherCharacterIds);
  const copyValueByItemId = new Map<number, number>();
  const [{ typeNames, locationNames }] = await Promise.all([
    loadCrossCharacterNames(entries),
    mapWithConcurrencyLimit(entries, ESI_FANOUT_CONCURRENCY, async (entry) => {
      for (const [itemId, value] of await loadOwnCopyValues(entry.characterId, entry.assets))
        copyValueByItemId.set(itemId, value);
    }),
  ]);

  const characterIdByItemId = new Map<number, number>();
  const characterNameById = new Map<number, string>();
  for (const entry of entries) {
    characterNameById.set(entry.characterId, entry.name);
    for (const asset of entry.assets) characterIdByItemId.set(asset.item_id, entry.characterId);
  }

  return {
    entries,
    typeNames,
    locationNames,
    characterIdByItemId,
    characterNameById,
    copyValueByItemId,
    skipped,
  };
}

function nameForNode(node: AssetTreeNode, typeNames: ReadonlyMap<number, string>): string {
  if (node.kind === 'bay') return '';
  return typeNames.get(node.asset.type_id) ?? `Type #${node.asset.type_id}`;
}

/**
 * Bays stay in their fixed Cargo Hold / Drone Bay / Fitting order; every other sibling
 * list sorts by resolved display name, matching the flat list this tree replaces.
 */
function sortNodes(
  nodes: readonly AssetTreeNode[],
  typeNames: ReadonlyMap<number, string>
): AssetTreeNode[] {
  const bays: AssetTreeNode[] = [];
  const rest: AssetTreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'bay') bays.push({ ...node, children: sortNodes(node.children, typeNames) });
    else if (node.kind === 'item') rest.push(node);
    else rest.push({ ...node, children: sortNodes(node.children, typeNames) });
  }
  rest.sort((a, b) => nameForNode(a, typeNames).localeCompare(nameForNode(b, typeNames)));
  return [...bays, ...rest];
}

/** Pinned stations (either scope) sort ahead of unpinned ones; each group orders by `sortField` (issue #88). */
function sortStations(
  stations: readonly AssetTreeStation[],
  labelFor: (station: AssetTreeStation) => string,
  typeNames: ReadonlyMap<number, string>,
  pinStateFor: (station: AssetTreeStation) => PinState,
  sortField: StationSortField,
  jumpsAwayFor: (station: AssetTreeStation) => JumpsAwayResult | undefined
): AssetTreeStation[] {
  return [...stations]
    .map((station) => ({ ...station, children: sortNodes(station.children, typeNames) }))
    .sort((a, b) =>
      compareStations(a, b, sortField, {
        labelFor,
        pinnedFor: (station) => pinStateFor(station) !== 'unpinned',
        jumpsAwayFor,
      })
    );
}

/**
 * Cross-character search (issue #746, formerly #85's toggle): who owns which
 * row, relative to the active Character — the three pieces always travel
 * together, so they get one value instead of three.
 */
interface CharacterBadgeContext {
  activeCharacterId: number | null;
  idByItemId: ReadonlyMap<number, number>;
  nameById: ReadonlyMap<number, string>;
}

/** The owning Character's name, only when it isn't the active Character — null means "no badge". */
function characterBadgeFor(itemId: number, ctx: CharacterBadgeContext): string | null {
  const ownerId = ctx.idByItemId.get(itemId);
  if (ownerId === undefined || ownerId === ctx.activeCharacterId) return null;
  return ctx.nameById.get(ownerId) ?? null;
}

/**
 * Assets-only supporting data an item row needs but a prop-threaded context
 * cannot carry cheaply — pricing/volume and the "View in Industry as
 * material" wiring. Quickbar, blueprint lookup and Show info are the page's
 * shared Item Actions (`itemActions.ts`) now, read by `ItemContextMenu`
 * itself; this context stays for what's Assets-specific. Reaching these
 * through `useContext` rather than props matters beyond style: the React
 * Compiler's purity/refs checks can verify a value read via Context is
 * deferred to event time, but lose that guarantee for a closure passed
 * through ordinary props.
 */
interface AssetItemActions {
  priceByTypeId: ReadonlyMap<number, number>;
  itemValueByItemId: ReadonlyMap<number, number>;
  /** Abyssal modules' MutaMarket estimates; a row on screen asks for its own. */
  abyssal: AbyssalAssetEstimates;
  volumeByTypeId: ReadonlyMap<number, number>;
  /** Material typeID -> the character's own Build Plan consuming it; null until the blueprint catalog has loaded. */
  materialPlanMap: ReadonlyMap<number, BuildPlanRecord> | null;
  onViewInIndustryAsMaterial: (typeId: number) => void;
  /** Blueprint typeIDs for the BPO badge; null until loaded, or when nothing listed can be a blueprint. */
  blueprintTypeIds: ReadonlySet<number> | null;
}

const AssetItemActionsContext = createContext<AssetItemActions | null>(null);

function useAssetItemActions(): AssetItemActions {
  const actions = useContext(AssetItemActionsContext);
  if (!actions) throw new Error('Asset row rendered outside its actions provider');
  return actions;
}

/**
 * One row of whatever list is currently on screen. Three list shapes share a
 * single virtualizer and a single row union rather than three parallel
 * implementations: the location list, one level of a location's contents, and
 * flat search results.
 */
type BrowseRow =
  | { kind: 'heading'; key: string; label: string; tone: 'default' | 'warning' }
  | { kind: 'location'; key: string; station: AssetTreeStation }
  | { kind: 'node'; key: string; node: AssetTreeNode }
  | { kind: 'match'; key: string; match: AssetMatch };

/** Estimated heights — the virtualizer windows on these, same fixed-estimate approach as the tree view it replaces. */
function estimateRowHeight(row: BrowseRow): number {
  return rootFontScale() * baseRowHeight(row);
}

function baseRowHeight(row: BrowseRow): number {
  switch (row.kind) {
    case 'heading':
      return 33;
    case 'location':
    case 'match':
      return 64;
    case 'node':
      return 48;
  }
}

/** An asset group's `location_type` as the kind a Place resolves under. */
function placeKindForStation(
  locationType: AssetTreeStation['locationType']
): 'station' | 'solar_system' | 'structure' | undefined {
  if (locationType === 'station' || locationType === 'solar_system') return locationType;
  return locationType === 'other' || locationType === 'item' ? 'structure' : undefined;
}

/**
 * An orphan group: `buildAssetTree` promotes an asset whose parent wasn't in
 * the fetched page to its own top-level group, which is why a bare "Container"
 * or a ship name can appear beside real stations. Most such parents really are
 * unresolvable (a cycle, or a page never fetched), but some are structure ids
 * ESI just never returns an asset row for (a personal-hangar division inside a
 * player-owned structure) — `loadAssetsSnapshot` best-effort resolves those via
 * the structures endpoint, and a hit there means this is a real, named
 * location after all, not an orphan.
 */
function isUnresolvedParent(
  station: AssetTreeStation,
  locationNames: ReadonlyMap<number, string>
): boolean {
  return station.locationType === 'item' && !locationNames.has(station.locationId);
}

/** Character assets, browsed one level at a time. Read-only, cached for offline. */
export function Assets() {
  const isPhone = useIsPhone();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openInFittings = useOpenInFittings();
  const viewedCharacterId = useViewedCharacterId();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadAssetsSnapshot,
    viewedCharacterId,
    { cacheKey: 'assets' }
  );

  // "Where am I" lives in the URL (`/assets/:stationId/*`), not in state, so
  // the browser/Android back button steps up one level instead of leaving the
  // page — the single most important thing about drill-down on a phone.
  const [tab, setTab] = usePageTab(ASSETS_TABS);
  const tabsId = useTabsId();
  const wildcard = useParams()['*'] ?? '';
  const { stationId: pathStationId, segments: pathSegments } = useMemo(
    () => parseAssetPath(wildcard),
    [wildcard]
  );

  // Query string carried onto every drill-down link (see `assetHref`).
  const { search: query } = useLocation();

  // Cross-character search (issue #746, replacing issue #85's binary toggle):
  // `'current'` (today's old off-state, no extra fan-out) or `'all'` once the
  // pilot asks via `CharacterFilterControl`. The URL wins; absent, this page's
  // remembered pick, then the synced Settings default. A link's value is never
  // remembered; only a change to the control is.
  const rememberedCharacterFilter = useRememberedCharacterFilter<typeof ASSETS_VIEW_PARAMS>(
    'assets',
    'chars'
  );
  const [view, setView] = useRememberedUrlParams(ASSETS_VIEW_PARAMS, rememberedCharacterFilter);
  const search = view.q;
  const setSearch = (q: string) => setView({ q });
  const searchActive = search.trim().length > 0;
  // Debounced separately from `search` (issue #415): the input stays
  // instantly responsive, only the matching/grouping memos below — which
  // scan every asset — wait out the debounce.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);

  // Permanent "all items across all locations" flat view (issue #414): off by
  // default (unpruned tree browsing, as before), and — like search — flattens
  // every location into one sortable list rather than replacing the tree.
  const allItemsView = view.all;
  const minValueInput = view.min;
  const flatModeActive = searchActive || allItemsView;
  // Held off while prices are still loading: every asset values 0 until then.
  const minValueThreshold = data?.pricesReady === false ? 0 : (parseIskAmount(minValueInput) ?? 0);

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

  // Viewing a named Character is a fixed scope: the cross-Character filter
  // (and its legacy `chars` value, which here named the Character) stands down.
  const crossCharacterFilter: CharacterFilterValue =
    viewedCharacterId === undefined ? view.chars : 'current';
  const resolvedCrossCharacterFilter = useResolvedCharacterFilter(
    crossCharacterFilter,
    activeCharacterId
  );

  const allCharactersQuery = useLiveQuery(() => db.characters.toArray(), [], []);
  const crossCharacterCandidates = useMemo(
    () =>
      (allCharactersQuery ?? []).map((c) => ({
        characterId: c.characterId,
        characterName: c.name,
      })),
    [allCharactersQuery]
  );
  // Absent for a one-Character account: "This character" and "All characters"
  // then resolve to the same pilot, leaving a control that cannot change
  // anything (`OpenOrdersPanel`'s precedent).
  const viewedCharacter =
    viewedCharacterId === undefined
      ? undefined
      : (allCharactersQuery ?? []).find((c) => c.characterId === viewedCharacterId);
  const crossCharacterFilterMeta =
    crossCharacterCandidates.length > 1 && viewedCharacterId === undefined ? (
      <CharacterFilterControl
        activeCharacterId={activeCharacterId}
        value={crossCharacterFilter}
        onChange={(chars: CharacterFilterValue) => setView({ chars })}
        characterCount={crossCharacterCandidates.length}
        // Rides in this route's own `PageHeader` meta (no titled inner
        // `Panel`), whose `actions` cluster sits at `IconButton`'s default
        // (larger) touch tier — match it, not the panel-`meta` default.
        size="md"
      />
    ) : undefined;

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

  // CSV export always stays scoped to the active Character's own assets,
  // regardless of the cross-character toggle — exporting another Character's
  // items without a character column would misattribute them.
  //
  // The grouped/sorted rows are built only when the export actually runs
  // (`assetsExport.getRows` below) — matching every asset and locale-sorting
  // on each data/search change was waste for a menu that is rarely opened.
  function buildCsvGroups() {
    const csvAssetsByItemId = new Map(
      (assetsResult?.data ?? []).map((asset) => [asset.item_id, asset])
    );
    const searched = matchAssets(assetsResult?.data ?? [], typeNames, debouncedSearch);
    // Flat views hide stacks under the minimum value on screen; the export
    // follows. Tree view ignores the filter, so its export does too.
    const matches =
      flatModeActive && minValueThreshold > 0
        ? searched.filter(
            (m) => assetStackValue(m.asset, priceByTypeId, itemValueByItemId) >= minValueThreshold
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
          locationNames,
          csvAssetsByItemId,
          typeNames,
          t
        ),
        entries: locationEntries.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

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
    idByItemId: activeCrossCharacterData?.characterIdByItemId ?? NO_NUMBERS,
    nameById: activeCrossCharacterData?.characterNameById ?? NO_NAMES,
  };

  const assetsByItemId = useMemo(
    () => new Map(mergedAssets.map((asset) => [asset.item_id, asset])),
    [mergedAssets]
  );

  // Opens on the pilot's Travel default; the picker here changes this view only.
  const [routeOverride, setRouteOverride] = useState<RoutePreferenceKind | null>(null);
  const assetsRoute = useJumpBasis(routeOverride);
  const routePreference = assetsRoute.rules.preference;

  const stationSortField = useStationSort((state) => state.value);
  const hydrateStationSort = useStationSort((state) => state.hydrate);
  const setStationSortField = useStationSort((state) => state.setValue);
  useEffect(() => {
    void hydrateStationSort();
  }, [hydrateStationSort]);

  // The flat (search / All Items) list's own sort, remembered the same way the
  // station list's is. Ungated on `hydrated`: this only reorders a list that is
  // already in memory, so the worst a late hydrate does is re-sort it — there
  // is no request to spend on the default first.
  const sortField = useAssetSort((state) => state.value);
  const hydrateAssetSort = useAssetSort((state) => state.hydrate);
  const setSortField = useAssetSort((state) => state.setValue);
  useEffect(() => {
    void hydrateAssetSort();
  }, [hydrateAssetSort]);

  // Jumps-away distances (issue #87): the active character's current solar
  // system, fetched once per page load (not polled) via ESI's location
  // endpoint. Re-fetched whenever the active character changes.
  const [characterSystemId, setCharacterSystemId] = useState<number | null>(null);
  const [characterLocationResolved, setCharacterLocationResolved] = useState(false);
  useEffect(() => {
    if (activeCharacterId === null) return;
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

  // The tree is built from every asset, unpruned: search no longer filters it
  // (results are a separate flat list), so browsing always sees the whole
  // structure and clearing a search never has to rebuild it.
  const tree = useMemo(
    () => buildAssetTree(mergedAssets, priceByTypeId, itemValueByItemId),
    [mergedAssets, priceByTypeId, itemValueByItemId]
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
    return matchAssets(mergedAssets, mergedTypeNames, debouncedSearch);
  }, [flatModeActive, allItemsView, mergedAssets, mergedTypeNames, debouncedSearch]);
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
      minValueThreshold > 0 ? valued.filter((v) => v.value >= minValueThreshold) : valued;
    return filtered.sort((a, b) => compareValuedAssetMatches(a, b, sortField)).map((v) => v.match);
  }, [
    flatModeActive,
    searchMatches,
    minValueThreshold,
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

  const scrollParentRef = useRef<HTMLDivElement>(null);
  // React Compiler isn't enabled in this build (no babel plugin configured);
  // this is eslint-plugin-react-hooks flagging TanStack Virtual's returned
  // functions as unsafe to memoize *if* the compiler is ever turned on.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => estimateRowHeight(rows[index]),
    // Rows wrap onto two lines at phone widths, so the estimate is only a first
    // guess — measure the real height or rows overlap. Zero (jsdom, a row not
    // laid out yet) falls back to the estimate.
    measureElement: (element, entry, instance) =>
      measureElement(element, entry, instance) ||
      instance.options.estimateSize(instance.indexFromElement(element)),
    getItemKey: (index) => rows[index].key,
    overscan: 10,
  });

  // Every level change is a different list; keep the new one at the top
  // rather than inheriting the previous level's scroll offset. Plain
  // `scrollTop` rather than `scrollTo()` — jsdom's test shim implements the
  // former, not the latter, and there's no smooth-scroll case here worth the
  // extra API surface.
  useEffect(() => {
    if (scrollParentRef.current) scrollParentRef.current.scrollTop = 0;
  }, [wildcard, flatModeActive]);

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

  // Not `useTableExport`: this list isn't a DataTable, and `getRows` builds
  // the grouped rows lazily, only when an export actually runs.
  const assetsCsvColumnList = useMemo(() => assetsCsvColumns(t), [t]);
  const assetsExport: TableExport<AssetCsvRow> = {
    surface: 'assets',
    columns: assetsCsvColumnList,
    truncated: assetsTruncated,
    getRows: () =>
      assetCsvRows(
        buildCsvGroups().map((group) => ({
          label: group.label,
          entries: group.entries.map((entry) => ({
            name: entry.name,
            quantity: entry.asset.quantity,
          })),
        }))
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

  if (!hydrated) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  // Breadcrumb: the station, then every node walked through. The last entry is
  // where we are; the ones before it are links back up.
  const crumbs =
    resolved.station === null
      ? []
      : [
          { label: stationLabelFor(resolved.station), href: assetHref(pathStationId, [], query) },
          ...resolved.trail.map((node, index) => ({
            label: nodeLabel(node),
            href: assetHref(
              pathStationId,
              resolved.trail.slice(0, index + 1).map(assetNodeSegment),
              query
            ),
          })),
        ];
  const parentHref =
    crumbs.length > 1 ? crumbs[crumbs.length - 2].href : assetHref(null, [], query);
  // A leaf item carries no aggregate of its own — there is nothing below it to
  // total — so the header simply drops the counts at that depth.
  const deepest = resolved.trail[resolved.trail.length - 1] ?? resolved.station;
  const currentTotals =
    deepest && (!('kind' in deepest) || deepest.kind !== 'item') ? deepest : null;

  // How the abyssal modules in view are valued: every asset at the root, the
  // level's contents when drilled in, the matches in a flat list.
  const abyssalSummary: AbyssalSummary | null = (() => {
    const isAbyssalType = abyssal.isAbyssalType;
    if (!isAbyssalType) return null;
    let scope: readonly Pick<CharacterAsset, 'item_id' | 'type_id'>[];
    if (flatModeActive) scope = flatMatches.map((match) => match.asset);
    else if (pathStationId === null) scope = mergedAssets;
    else if (!deepest) scope = [];
    else {
      const ids = 'kind' in deepest ? collectItemIds(deepest) : collectStationItemIds(deepest);
      scope = ids.flatMap((id) => assetsByItemId.get(id) ?? []);
    }
    return summarizeAbyssal(
      abyssalItemRefs(scope, isAbyssalType).map((item) => item.itemId),
      abyssal.values,
      abyssal.estimates
    );
  })();

  // Phone station header (#2989): security · ISK · jumps on a second line, so the
  // top line is the back button and the full-width station name. An absent item
  // (unknown security, jumps still loading) drops out with its dot.
  const phoneFacts = (() => {
    if (!isPhone || pathStationId === null || !resolved.station) return null;
    const { station } = resolved;
    const resolvedStation = !isUnresolvedParent(station, mergedLocationNames);
    const facts: { key: string; node: ReactNode }[] = [];
    const security = resolvedStation ? securityForStation(station.locationId) : null;
    if (security !== null && security !== undefined) {
      facts.push({ key: 'security', node: <SecurityValue security={security} /> });
    }
    if (currentTotals) {
      facts.push({
        key: 'isk',
        node: (
          <span className="text-isk-pos">
            <IskAmount value={currentTotals.estimatedValue} decimals={0} />
          </span>
        ),
      });
    }
    const jumps = resolvedStation ? jumpsAwayOf(station.locationId) : undefined;
    if (jumps) {
      facts.push({
        key: 'jumps',
        node: (
          <JumpsAwayText
            result={jumps}
            t={t}
            locationId={station.locationId}
            preference={routeOverride}
            linkClassName="inline-flex min-h-11 items-center"
          />
        ),
      });
    }
    return facts.length > 0 ? facts : null;
  })();

  return (
    <ItemActionsProvider page={itemActions}>
      <div
        className={cx(
          'mx-auto flex w-full max-w-6xl flex-col gap-3',
          // Fills the remaining viewport height (issue #148) rather than
          // growing with content: bounds the height against `<main>`'s own
          // chrome (Layout.tsx's `p-4`, plus the mobile bottom nav's
          // `calc(5rem+safe-area)` reservation below `md`, mirrored here since
          // that reservation isn't itself exposed as a token) so the list
          // Panel below — the only `flex-1` child — has real remaining space
          // to fill instead of a `flex-1` that's inert with no bounded
          // ancestor.
          'h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-2rem)]'
        )}
      >
        <FromWalletCrumb />
        <PageHeader
          title={t('assets.title')}
          // `CharacterFilterControl` rides here rather than in `actions` per
          // `docs/context/decisions/20260908-192806-the-character-filter-rides-in-the-panel-header.md`
          // — Assets has no titled inner `Panel` to attach it to, so it takes
          // the page-level title band instead, the same "names whose data this
          // is" role the decision describes for a panel's own `meta`.
          meta={
            <>
              <WalletOriginCrumb />
              {viewedCharacter && (
                <CharacterScopeReadout
                  scope="one"
                  characterId={viewedCharacter.characterId}
                  characterName={viewedCharacter.name}
                />
              )}
              {assetsResult && <DataAgeBadge date={assetsResult.fetchedAt} />}
              {crossCharacterFilterMeta}
              {activeCrossCharacterData && activeCrossCharacterData.skipped.length > 0 && (
                <CharacterScopeReadout
                  scope="all"
                  total={
                    activeCrossCharacterData.entries.length +
                    activeCrossCharacterData.skipped.length +
                    1
                  }
                  missing={activeCrossCharacterData.skipped.map((c) => c.name)}
                />
              )}
              {otherCharacterIds.length > 0 && crossCharacterLoading && (
                <Spinner size="sm" label={t('assets.crossCharacterLoading')} />
              )}
            </>
          }
          actions={
            <>
              {tab === 'items' && (
                <div className="ml-auto flex items-center gap-1.5">
                  <TableActionsMenu
                    name={t('assets.title')}
                    label={t('assets.tools.label')}
                    triggerText={t('assets.tools.label')}
                    tableExport={assetsExport}
                    size="md"
                  >
                    <DropdownMenuLabel>{t('assets.tools.view')}</DropdownMenuLabel>
                    <DropdownMenuCheckboxItem
                      checked={allItemsView}
                      onCheckedChange={(on) => setView({ all: on })}
                    >
                      {t('assets.allItemsToggle')}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuCheckboxItem
                      checked={selectMode}
                      onCheckedChange={toggleSelectMode}
                    >
                      {t('assets.select.toggle')}
                    </DropdownMenuCheckboxItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled={loading} onSelect={refresh}>
                      {t('assets.refresh')}
                      {assetsResult && (
                        <span className="ml-auto pl-3 text-text-dim">
                          {formatAge(Date.now() - new Date(assetsResult.fetchedAt).getTime(), t)}
                        </span>
                      )}
                    </DropdownMenuItem>
                  </TableActionsMenu>
                </div>
              )}
            </>
          }
        />
        <Tabs
          tabsId={tabsId}
          label={t('assets.title')}
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
          tabs={tabBarTabs(ASSETS_TABS).map((item) => ({ id: item.id, label: t(item.labelKey) }))}
        />

        <TabPanel tabsId={tabsId} tabId={tab} className="flex min-h-0 flex-1 flex-col gap-3">
          {tab === 'ships' && (
            <MyShipsView
              characterIds={shipCharacterIds}
              activeCharacterId={activeCharacterId}
              onShowAllCharacters={
                !shipsFilterIsAll && crossCharacterCandidates.length > 1
                  ? () => setView({ chars: 'all' })
                  : undefined
              }
              hrefFor={(locationId) => assetHref(locationId, [], query)}
              route={assetsRoute}
            />
          )}

          {tab === 'move' && (
            <MovePlanTab
              onClose={() => setTab('items')}
              characterIds={shipCharacterIds}
              activeCharacterId={activeCharacterId}
            />
          )}

          {tab === 'items' && (
            <LiveStatus>
              {selectMode && selectedIds.size > 0
                ? t('assets.select.selectedCount', { count: selectedIds.size })
                : searchActive && debouncedSearch.trim().length > 0
                  ? t('assets.search.resultCount', { count: flatMatches.length })
                  : null}
            </LiveStatus>
          )}

          {tab === 'items' && assetsResult && (
            <SearchInput
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('assets.searchPlaceholder')}
            />
          )}

          {tab === 'items' && selectMode && (
            <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 px-3 py-2">
              {selectedIds.size > 0 && (
                <span aria-hidden="true" className="text-[0.6875rem] text-text-dim tabular-nums">
                  {t('assets.select.selectedCount', { count: selectedIds.size })}
                </span>
              )}
              <Button size="sm" onClick={handleSelectAllInView}>
                {t('assets.select.selectAllInView')}
              </Button>
              <Button size="sm" disabled={selectedIds.size === 0} onClick={handleDeselectAll}>
                {t('assets.select.deselectAll')}
              </Button>
              {selectedIds.size > 0 && (
                <>
                  <Button
                    size="sm"
                    disabled={activeCharacterId === null}
                    onClick={handleBulkAddToQuickbar}
                  >
                    {t('assets.select.addToQuickbar')}
                  </Button>
                  <Button size="sm" onClick={handleBulkAppraise}>
                    {t('assets.select.appraise')}
                  </Button>
                  <Button size="sm" onClick={handleBulkCopyNames}>
                    {t('assets.select.copyNames')}
                  </Button>
                  <Button size="sm" onClick={handleBulkCopyWithQuantities}>
                    {t('assets.select.copyWithQuantities')}
                  </Button>
                </>
              )}
            </div>
          )}

          {tab !== 'items' ? null : loading && !data ? (
            <div className="flex justify-center py-16">
              <Spinner label={t('common.loading')} />
            </div>
          ) : assetsNeedsReauth && !assetsResult ? (
            // A lapsed grant with nothing saved: the full banner. With a saved
            // copy the items stay and a small note sits above them.
            <GrantBanner
              characterId={activeCharacterId}
              endpoints={['getCharacterAssets']}
              title={t('assets.reauthTitle')}
              hint={t('assets.reauthHint')}
              actionLabel={t('assets.reauthAction')}
            />
          ) : error ? (
            <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
          ) : !assetsResult ? (
            <EmptyState title={t('assets.emptyTitle')} hint={t('assets.emptyHint')} />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {assetsNeedsReauth && (
                <ReauthCachedNote
                  characterId={activeCharacterId}
                  endpoints={['getCharacterAssets']}
                />
              )}
              {assetsResult.fromCache && <CachedNotice fetchedAt={assetsResult.fetchedAt} />}
              {assetsTruncated && (
                <p className="flex flex-wrap items-center gap-2 text-[0.6875rem] text-warning uppercase">
                  <span>
                    {t('common.incompleteTitle')} —{' '}
                    {t('assets.fetchTruncatedNotice', { shown: assetsResult.data.length })}
                  </span>
                  <Button size="sm" disabled={loading} onClick={refresh}>
                    {t('assets.fetchTruncatedRetry')}
                  </Button>
                </p>
              )}

              <AssetItemActionsContext.Provider value={assetItemActions}>
                <Panel padded={false} fill className="flex min-h-0 flex-1 flex-col">
                  {/* --- level header: breadcrumb when drilled in, sort controls at the root --- */}
                  {flatModeActive ? (
                    <div className="flex h-11 shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3 md:h-9">
                      <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                        {t('assets.search.resultCount', { count: flatMatches.length })}
                      </span>
                      {/* CSV export always stays scoped to the active Character's own
                      assets (see buildCsvGroups above) — this is the only UI surface
                      that explains why (issue #415), shown exactly when cross-
                      character results are actually on screen to be confused by. */}
                      {activeCrossCharacterData && (
                        <span className="text-[0.6875rem] text-text-dim">
                          {t('assets.crossCharacterCsvNote')}
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        <IskInput
                          size="sm"
                          echo={false}
                          value={minValueInput}
                          onChange={(min) => setView({ min })}
                          placeholder={t('assets.minValue.placeholder')}
                          aria-label={t('assets.minValue.label')}
                          className="w-24"
                        />
                        <Select
                          value={sortField}
                          onValueChange={(value) => void setSortField(value as AssetSortField)}
                        >
                          <SelectTrigger
                            size="sm"
                            aria-label={t('assets.sort.label')}
                            className="w-28"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="name">{t('assets.sort.name')}</SelectItem>
                            <SelectItem value="value">{t('assets.sort.value')}</SelectItem>
                            <SelectItem value="quantity">{t('assets.sort.quantity')}</SelectItem>
                          </SelectContent>
                        </Select>
                        {searchActive && (
                          <IconButton
                            icon={<Icon.Close />}
                            label={t('assets.search.clear')}
                            variant="plain"
                            size="sm"
                            onClick={() => {
                              setSearch('');
                              searchRef.current?.focus();
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ) : pathStationId !== null ? (
                    <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel-2 py-1.5 pr-3 pl-1">
                      <IconButton
                        icon={<Icon.Back size={Icon.ICON_SIZE.lg} />}
                        label={t('assets.breadcrumb.back')}
                        variant="plain"
                        onClick={() => void navigate(parentHref)}
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <h2
                          ref={levelHeadingRef}
                          tabIndex={-1}
                          className="truncate text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          {crumbs.length > 0 ? crumbs[crumbs.length - 1].label : ''}
                          {currentTotals && (
                            <span className="sr-only">
                              {t('assets.levelHeading.itemsSuffix', {
                                items: t('assets.itemCount', { count: currentTotals.itemCount }),
                              })}
                            </span>
                          )}
                        </h2>
                        {phoneFacts && (
                          <span className="flex flex-wrap items-center gap-x-1 text-[0.6875rem] text-text-dim tabular-nums">
                            {phoneFacts.map((fact, index) => (
                              <span key={fact.key} className="flex items-center gap-1">
                                {index > 0 && <span aria-hidden="true">·</span>}
                                {fact.node}
                              </span>
                            ))}
                          </span>
                        )}
                        {crumbs.length > 1 && (
                          <span className="flex min-w-0 items-center gap-1 truncate text-[0.6875rem] text-text-dim">
                            {crumbs.slice(0, -1).map((crumb, index) => (
                              <span key={crumb.href} className="flex min-w-0 items-center gap-1">
                                {index > 0 && <span aria-hidden="true">›</span>}
                                <Link to={crumb.href} className="truncate hover:text-accent">
                                  {crumb.label}
                                </Link>
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                      {!phoneFacts &&
                        resolved.station &&
                        !isUnresolvedParent(resolved.station, mergedLocationNames) && (
                          <span className="hidden shrink-0 items-center gap-2 text-[0.6875rem] text-text-dim sm:flex">
                            <SecurityValue
                              security={securityForStation(resolved.station.locationId)}
                            />
                            <JumpsAwayText
                              result={jumpsAwayOf(resolved.station.locationId)}
                              t={t}
                              locationId={resolved.station.locationId}
                              preference={routeOverride}
                            />
                          </span>
                        )}
                      {currentTotals && !phoneFacts && (
                        <span className="shrink-0 text-[0.6875rem] text-text-dim tabular-nums">
                          <span className="hidden sm:inline">
                            {t('assets.itemCount', { count: currentTotals.itemCount })} ·{' '}
                          </span>
                          <span className="text-sm font-semibold text-isk-pos">
                            <IskAmount value={currentTotals.estimatedValue} decimals={0} />
                          </span>
                        </span>
                      )}
                      {deepest && 'kind' in deepest && deepest.kind === 'ship' && (
                        <Button
                          size="md"
                          className="shrink-0"
                          loading={openInFittings.pending}
                          onClick={() =>
                            openInFittings.open(() =>
                              assetShipEditLocation(deepest, nodeLabel(deepest))
                            )
                          }
                        >
                          {t('assets.openInFittings')}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3 py-1.5">
                        <h2
                          ref={levelHeadingRef}
                          tabIndex={-1}
                          className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                        >
                          {t('assets.section.locationCount', { count: sortedTree.length })}
                          {showTotalValueChip && ' · '}
                          {showTotalValueChip && (
                            <span
                              data-testid="assets-total-value"
                              className="text-sm font-semibold tracking-normal text-isk-pos normal-case tabular-nums"
                            >
                              {totalValueFiltered
                                ? t('assets.section.totalValueFiltered', {
                                    value: formatIsk(totalValue),
                                  })
                                : t('assets.section.totalValue', { value: formatIsk(totalValue) })}
                            </span>
                          )}
                        </h2>
                        {/* flex-wrap (issue #415): on a narrow phone the two Selects no
                        longer share one row with no priority order — Sort stays put
                        (it comes first in DOM order) and Route is the one that drops
                        to its own line when both can't fit beside the label. */}
                        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          <Select
                            value={stationSortField}
                            onValueChange={(value) =>
                              void setStationSortField(value as StationSortField)
                            }
                          >
                            <SelectTrigger
                              aria-label={t('assets.stationSort.label')}
                              className="w-36"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="name">{t('assets.stationSort.name')}</SelectItem>
                              <SelectItem value="value">{t('assets.stationSort.value')}</SelectItem>
                              <SelectItem value="itemCount">
                                {t('assets.stationSort.itemCount')}
                              </SelectItem>
                              <SelectItem value="jumpsAway">
                                {t('assets.stationSort.jumpsAway')}
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Select
                            value={routePreference}
                            onValueChange={(value) =>
                              setRouteOverride(value as RoutePreferenceKind)
                            }
                          >
                            <SelectTrigger
                              aria-label={t('assets.jumpsAway.routePreference.label')}
                              className="w-40"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {ROUTE_PREFERENCES.map((preference) => (
                                <SelectItem key={preference} value={preference}>
                                  {t(ROUTE_PREFERENCE_LABEL_KEYS[preference])}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {/* Without the grant every row degrades to "-"; the note
                      says why (issue #1590). */}
                      <GrantNote
                        className="shrink-0 border-b border-line px-3"
                        characterId={activeCharacterId}
                        endpoints={LOCATION_ENDPOINTS}
                        title={t('assets.jumpsAway.locationNotGrantedTitle')}
                        hint={t('assets.jumpsAway.locationNotGrantedHint')}
                        actionLabel={t('assets.jumpsAway.locationNotGrantedAction')}
                      />
                    </>
                  )}

                  {abyssalSummary && (
                    <AbyssalValueNote
                      summary={abyssalSummary}
                      className="shrink-0 border-b border-line px-3 py-1.5"
                    />
                  )}

                  {/* --- the list --- */}
                  {resolved.unresolved.length > 0 ? (
                    <EmptyState
                      title={t('assets.staleLink.title')}
                      hint={t('assets.staleLink.hint')}
                      className="py-8"
                      action={
                        <Button size="sm" onClick={() => void navigate(assetHref(null, [], query))}>
                          {t('assets.staleLink.action')}
                        </Button>
                      }
                    />
                  ) : rows.length === 0 ? (
                    <EmptyState
                      title={flatModeActive ? t('assets.noResults') : t('assets.emptyLocation')}
                      className="py-8"
                    />
                  ) : (
                    <div
                      ref={scrollParentRef}
                      data-virtual-scroll-root
                      role="region"
                      aria-label={t('assets.treeLabel')}
                      className="min-h-0 flex-1 overflow-y-auto"
                    >
                      {showItemColumns && <ItemColumnLabels t={t} />}
                      <div
                        role="presentation"
                        style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}
                      >
                        <TableExportProvider tableExport={assetsExport}>
                          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const row = rows[virtualRow.index];
                            return (
                              <div
                                key={virtualRow.key}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                style={{
                                  position: 'absolute',
                                  top: 0,
                                  left: 0,
                                  width: '100%',
                                  transform: `translateY(${virtualRow.start}px)`,
                                }}
                              >
                                <BrowseRowView
                                  row={row}
                                  t={t}
                                  typeNames={mergedTypeNames}
                                  characterBadges={characterBadges}
                                  selectMode={selectMode}
                                  selectedIds={selectedIds}
                                  onToggleSelection={toggleNodeSelection}
                                  stationLabelFor={stationLabelFor}
                                  nodeLabel={nodeLabel}
                                  locationNames={mergedLocationNames}
                                  securityForStation={securityForStation}
                                  jumpsAwayFor={jumpsAwayOf}
                                  pinStateFor={pinStateFor}
                                  onTogglePin={(locationId) => void handleTogglePin(locationId)}
                                  pathStationId={pathStationId}
                                  pathSegments={pathSegments}
                                  trailFor={trailFor}
                                  rootStationIdFor={rootStationIdFor}
                                  query={query}
                                />
                              </div>
                            );
                          })}
                        </TableExportProvider>
                      </div>
                    </div>
                  )}
                </Panel>
              </AssetItemActionsContext.Provider>
            </div>
          )}
        </TabPanel>
      </div>
    </ItemActionsProvider>
  );
}

interface BrowseRowViewProps {
  row: BrowseRow;
  t: Translate;
  typeNames: ReadonlyMap<number, string>;
  characterBadges: CharacterBadgeContext;
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelection: (ids: readonly number[]) => void;
  stationLabelFor: (station: AssetTreeStation) => string;
  nodeLabel: (node: AssetTreeNode) => string;
  locationNames: ReadonlyMap<number, string>;
  securityForStation: (locationId: number) => number | null | undefined;
  jumpsAwayFor: (locationId: number) => JumpsAwayResult | undefined;
  pinStateFor: (locationId: number) => PinState;
  onTogglePin: (locationId: number) => void;
  pathStationId: number | null;
  pathSegments: readonly string[];
  trailFor: (asset: CharacterAsset) => string[];
  rootStationIdFor: (asset: CharacterAsset) => number | null;
  /** The page's query string, carried onto every drill-down link. */
  query: string;
}

/** Dispatches one virtualized row to the right presentation component. */
function BrowseRowView(props: BrowseRowViewProps) {
  const { row, t } = props;

  if (row.kind === 'heading') {
    return <SectionHeading tone={row.tone}>{row.label}</SectionHeading>;
  }

  if (row.kind === 'location') {
    const { station } = row;
    const orphan = isUnresolvedParent(station, props.locationNames);
    return (
      <LocationRow
        href={assetHref(station.locationId, [], props.query)}
        label={props.stationLabelFor(station)}
        security={orphan ? undefined : props.securityForStation(station.locationId)}
        jumpsAway={orphan ? undefined : props.jumpsAwayFor(station.locationId)}
        itemCount={station.itemCount}
        estimatedValue={station.estimatedValue}
        pinState={props.pinStateFor(station.locationId)}
        onTogglePin={() => props.onTogglePin(station.locationId)}
        unresolvedParent={orphan}
        selectMode={props.selectMode}
        selectionState={selectionStateForIds(collectStationItemIds(station), props.selectedIds)}
        onToggleSelection={() => props.onToggleSelection(collectStationItemIds(station))}
        t={t}
      />
    );
  }

  if (row.kind === 'node') {
    return <NodeRowView {...props} node={row.node} />;
  }

  return <SearchMatchRow {...props} match={row.match} />;
}

/**
 * An abyssal module's row asks for its MutaMarket estimate while it is on
 * screen, and names what its value is (or why it has none). Undefined for
 * any other stack.
 */
function useAbyssalValueHint(
  asset: Pick<CharacterAsset, 'item_id' | 'type_id'> | null,
  abyssal: AbyssalAssetEstimates,
  t: Translate
): string | undefined {
  const isAbyssal = asset !== null && (abyssal.isAbyssalType?.(asset.type_id) ?? false);
  const itemId = asset?.item_id;
  const typeId = asset?.type_id;
  const { request } = abyssal;
  useEffect(() => {
    if (!isAbyssal || itemId === undefined || typeId === undefined) return undefined;
    // Leaving the screen before its turn drops the ask.
    return request({ itemId, typeId });
  }, [isAbyssal, itemId, typeId, request]);
  if (!isAbyssal || itemId === undefined) return undefined;
  return abyssalValueHint(abyssal.estimates.get(itemId), t);
}

/** Split out so it can call `useAssetItemActions` — a heading/location row does not. */
function SearchMatchRow({
  match,
  t,
  characterBadges,
  securityForStation,
  trailFor,
  rootStationIdFor,
  query,
}: BrowseRowViewProps & { match: AssetMatch }) {
  const actions = useAssetItemActions();
  const { asset, name } = match;
  const valueHint = useAbyssalValueHint(asset, actions.abyssal, t);
  const rootStationId = rootStationIdFor(asset);
  return (
    <SearchResultRow
      name={name}
      quantity={asset.quantity}
      estimatedValue={assetStackValue(asset, actions.priceByTypeId, actions.itemValueByItemId)}
      trail={trailFor(asset)}
      security={rootStationId === null ? undefined : securityForStation(rootStationId)}
      href={assetHref(rootStationId, [], query)}
      characterBadge={characterBadgeFor(asset.item_id, characterBadges)}
      blueprintKind={assetBlueprintKind(asset, actions.blueprintTypeIds)}
      valueHint={valueHint}
      t={t}
    />
  );
}

/** Split out so it can call `useAssetItemActions` — a leaf needs pricing/menu wiring a heading does not. */
function NodeRowView({
  node,
  t,
  selectMode,
  selectedIds,
  onToggleSelection,
  nodeLabel,
  characterBadges,
  pathStationId,
  pathSegments,
  query,
}: BrowseRowViewProps & { node: AssetTreeNode }) {
  const actions = useAssetItemActions();
  const pageActions = useItemActions();
  const label = nodeLabel(node);
  const badge = node.kind === 'bay' ? null : characterBadgeFor(node.asset.item_id, characterBadges);

  const valueHint = useAbyssalValueHint(
    node.kind === 'item' ? node.asset : null,
    actions.abyssal,
    t
  );
  if (node.kind !== 'item') {
    return (
      <ContainerRow
        href={assetHref(pathStationId, [...pathSegments, assetNodeSegment(node)], query)}
        label={label}
        itemCount={node.itemCount}
        estimatedValue={node.estimatedValue}
        characterBadge={badge}
        named={node.kind !== 'bay'}
        selectMode={selectMode}
        selectionState={selectionStateForIds(collectItemIds(node), selectedIds)}
        onToggleSelection={() => onToggleSelection(collectItemIds(node))}
        t={t}
      />
    );
  }

  const { asset } = node;
  // A Mutated module's Show info opens on its own Rolls; any other stack's on its type.
  const itemId = actions.abyssal.isAbyssalType?.(asset.type_id) ? asset.item_id : undefined;
  const estimatedValue = assetStackValue(asset, actions.priceByTypeId, actions.itemValueByItemId);
  const planTarget =
    pageActions.blueprints === null
      ? undefined
      : planTargetForItem(pageActions.blueprints, asset.type_id);
  const blueprintTypeID =
    planTarget === undefined ? undefined : (planTarget?.blueprintTypeID ?? null);
  const onViewInIndustryAsMaterial = actions.materialPlanMap?.has(asset.type_id)
    ? () => actions.onViewInIndustryAsMaterial(asset.type_id)
    : undefined;

  return (
    <ItemRow
      name={label}
      quantity={asset.quantity}
      unitVolume={actions.volumeByTypeId.get(asset.type_id)}
      estimatedValue={estimatedValue}
      valueHint={valueHint}
      characterBadge={badge}
      blueprintKind={assetBlueprintKind(asset, actions.blueprintTypeIds)}
      typeId={asset.type_id}
      itemId={itemId}
      selectMode={selectMode}
      selectionState={selectedIds.has(asset.item_id) ? 'checked' : 'unchecked'}
      onToggleSelection={() => onToggleSelection([asset.item_id])}
      t={t}
      wrap={(children) => (
        <OreItemMenu
          quantity={asset.quantity}
          typeId={asset.type_id}
          itemId={itemId}
          itemName={label}
          blueprintTypeID={blueprintTypeID}
          planProductTypeID={planTarget?.productTypeID}
          onViewInIndustryAsMaterial={onViewInIndustryAsMaterial}
        >
          {children}
        </OreItemMenu>
      )}
    />
  );
}
