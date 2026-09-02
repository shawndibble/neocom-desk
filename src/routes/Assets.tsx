import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  ReauthBanner,
  SearchInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { beginEveLogin } from '@/app/loginFlow';
import { isSyncConfigured } from '@/app/syncStatus';
import {
  clearStationPin,
  scheduleSync,
  setAccountStationPin,
  setCharacterStationPin,
} from '@/sync';
import { db, type QuickbarItem } from '@/db';
import { cx } from '@/lib/cx';
import { nextPinState, pinStateForStation, type PinState } from '@/features/character/stationPins';
import {
  loadCharacterAssets,
  loadOtherCharactersAssets,
  type OtherCharacterAssets,
} from '@/features/character/assets';
import type { CachedResult } from '@/esi/cache';
import { loadStationName, loadStationSystemId } from '@/features/character/stations';
import { loadStructureName, loadStructureSystemId } from '@/features/character/structures';
import { loadSystemSecurity, loadSystemName } from '@/features/character/systemSecurity';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadCharacterSolarSystemId } from '@/features/character/location';
import { loadJumpsAway } from '@/features/character/routeDistance';
import { useRoutePreference, type RoutePreference } from '@/features/character/routePreference';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import type { CharacterAsset } from '@/esi/endpoints';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { downloadCsv } from '@/lib/downloadCsv';
import { assetCsvRows, assetsCsvColumns } from '@/features/character/assetsCsv';
import { getAdjustedPrices } from '@/market/prices';
import { formatIsk } from '@/lib/isk';
import { loadTypes } from '@/sde/loadSde';
import {
  buildAssetTree,
  compareStations,
  collectItemIds,
  collectStationItemIds,
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
import {
  namesForSelection,
  selectionStateForIds,
  toggleSelection,
} from '@/features/character/assetSelection';
import {
  ContainerRow,
  ItemRow,
  JumpsAwayText,
  LocationRow,
  SearchResultRow,
  SectionHeading,
  SecurityValue,
} from '@/features/character/assetBrowserRows';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { addQuickbarItem } from '@/features/market/quickbar';
import { useCompareSet } from '@/features/market/compareSet';
import { writeToClipboard } from '@/lib/clipboard';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';

/** Stable identity, so the fallback doesn't invalidate the grouping memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_PRICES: ReadonlyMap<number, number> = new Map();
const NO_VOLUMES: ReadonlyMap<number, number> = new Map();
const EMPTY_ITEM_OWNERS: ReadonlyMap<number, number> = new Map();
const EMPTY_CHARACTER_NAMES: ReadonlyMap<number, string> = new Map();

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

/** An asset stack's value at the global average price — 0 (not "unknown") for a type with no resolved price. */
function estimatedValueFor(
  asset: { type_id: number; quantity: number },
  priceByTypeId: ReadonlyMap<number, number>
): number {
  return asset.quantity * (priceByTypeId.get(asset.type_id) ?? 0);
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

/** Global average market prices, best-effort — a Fuzzwork/ESI outage degrades badges to 0 rather than the whole page. */
async function loadAssetPrices(): Promise<Map<number, number>> {
  try {
    const prices = await getAdjustedPrices();
    const byType = new Map<number, number>();
    for (const [typeId, price] of prices) {
      if (price.average !== null) byType.set(typeId, price.average);
    }
    return byType;
  } catch {
    return new Map();
  }
}

/** Physical volume (m3, unpackaged) per type, best-effort from the slim SDE snapshot — never fetched live per hover, so a market/asset-only type this snapshot doesn't cover just shows as unknown. */
async function loadTypeVolumes(typeIds: readonly number[]): Promise<Map<number, number>> {
  try {
    const types = await loadTypes();
    const map = new Map<number, number>();
    for (const id of typeIds) {
      const volume = types[String(id)]?.volume;
      if (volume !== undefined) map.set(id, volume);
    }
    return map;
  } catch {
    return new Map();
  }
}

async function loadAssetsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<Snapshot> {
  const [{ cached: assetsResult, needsReauth: assetsNeedsReauth }, priceByTypeId] =
    await Promise.all([loadCharacterAssets(characterId), loadAssetPrices()]);
  const assetsTruncated = assetsResult?.truncated ?? false;
  const assets = assetsResult?.data ?? [];

  // Already superseded: skip the ESI name resolves, their results would be discarded.
  const typeIds = signal.cancelled ? [] : [...new Set(assets.map((a) => a.type_id))];
  const [typeNames, volumeByTypeId] = await Promise.all([
    loadTypeNames(typeIds),
    loadTypeVolumes(typeIds),
  ]);

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

  return {
    assetsResult,
    assetsTruncated,
    assetsNeedsReauth,
    typeNames,
    locationNames,
    priceByTypeId,
    volumeByTypeId,
  };
}

/** Everything the cross-character search toggle (issue #85) merges into the active Character's own snapshot. */
interface CrossCharacterData {
  entries: OtherCharacterAssets[];
  typeNames: Map<number, string>;
  locationNames: Map<number, string>;
  /** Owning Character per asset item_id — item ids are globally unique, so this is safe to merge flat across Characters. */
  characterIdByItemId: Map<number, number>;
  characterNameById: Map<number, string>;
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

/** Fetches + resolves everything the cross-character search toggle needs, once per toggle-on. */
async function loadCrossCharacterData(activeCharacterId: number): Promise<CrossCharacterData> {
  const entries = await loadOtherCharactersAssets(activeCharacterId);
  const { typeNames, locationNames } = await loadCrossCharacterNames(entries);

  const characterIdByItemId = new Map<number, number>();
  const characterNameById = new Map<number, string>();
  for (const entry of entries) {
    characterNameById.set(entry.characterId, entry.name);
    for (const asset of entry.assets) characterIdByItemId.set(asset.item_id, entry.characterId);
  }

  return { entries, typeNames, locationNames, characterIdByItemId, characterNameById };
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
 * Cross-character search (issue #85): who owns which row, relative to the
 * active Character — the three pieces always travel together, so they get
 * one value instead of three.
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
 * The item context menu's actions and their supporting data (Quickbar,
 * blueprint catalog, pricing/volume) — everything an item row needs but a
 * prop-threaded context cannot carry cheaply. Reaching these through
 * `useContext` rather than props matters beyond style: the React Compiler's
 * purity/refs checks can verify a value read via Context is deferred to event
 * time, but lose that guarantee for a closure passed through ordinary props.
 */
interface AssetItemActions {
  priceByTypeId: ReadonlyMap<number, number>;
  volumeByTypeId: ReadonlyMap<number, number>;
  blueprintCatalog: BlueprintCatalog | null;
  quickbarAvailable: boolean;
  onRequestBlueprintCatalog: () => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  onShowInfo: (typeId: number, itemName: string) => void;
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadAssetsSnapshot);

  // "Where am I" lives in the URL (`/assets/:stationId/*`), not in state, so
  // the browser/Android back button steps up one level instead of leaving the
  // page — the single most important thing about drill-down on a phone.
  const wildcard = useParams()['*'] ?? '';
  const { stationId: pathStationId, segments: pathSegments } = useMemo(
    () => parseAssetPath(wildcard),
    [wildcard]
  );

  const [search, setSearch] = useState('');
  const searchActive = search.trim().length > 0;

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

  // Cross-character search (issue #85): off by default, and device/session-local
  // rather than a synced or persisted preference — flipping it on fetches every
  // other authenticated Character's assets once, reused for the rest of this
  // search session. A stale `crossCharacterData` left over from a previous
  // toggle-on is harmless while the toggle is off: `activeCrossCharacterData`
  // below only reads it when the toggle is on AND a search is active, so
  // there is nothing to reset on toggle-off.
  const [crossCharacterSearch, setCrossCharacterSearch] = useState(false);
  const [crossCharacterData, setCrossCharacterData] = useState<CrossCharacterData | null>(null);
  const [crossCharacterLoading, setCrossCharacterLoading] = useState(false);
  useEffect(() => {
    if (!crossCharacterSearch || activeCharacterId === null) return;
    let cancelled = false;
    void (async () => {
      setCrossCharacterLoading(true);
      try {
        const result = await loadCrossCharacterData(activeCharacterId);
        if (!cancelled) setCrossCharacterData(result);
      } finally {
        if (!cancelled) setCrossCharacterLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [crossCharacterSearch, activeCharacterId]);
  // Only reaches beyond the active Character while an actual search is
  // active — flipping the toggle on alone doesn't change browsing. Narrowed
  // (not a plain boolean) so every memo below gets a non-null value for free.
  const activeCrossCharacterData = crossCharacterSearch && searchActive ? crossCharacterData : null;

  // Quickbar (CONTEXT.md): the same Editable Data record the Market
  // Browser's item context menu writes to, keyed by the active character.
  const quickbarRecord = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    return db.quickbars.get(String(activeCharacterId));
  }, [activeCharacterId]);
  const quickbarItems = quickbarRecord?.items ?? [];

  async function writeQuickbar(items: QuickbarItem[]) {
    if (activeCharacterId === null) return;
    await db.quickbars.put({
      id: String(activeCharacterId),
      characterId: activeCharacterId,
      items,
      updatedAt: Date.now(),
    });
    if (isSyncConfigured()) scheduleSync(activeCharacterId);
  }
  function handleAddToQuickbar(typeId: number, itemName: string) {
    void writeQuickbar(addQuickbarItem(quickbarItems, { typeId, name: itemName }));
  }

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

  // Blueprint catalog for the context menu's Build Plan action, loaded
  // lazily on the first menu open — same trade-off as the Market Browser:
  // it pulls the full SDE types.json and most page visits never open a menu.
  const [blueprintCatalog, setBlueprintCatalog] = useState<BlueprintCatalog | null>(null);
  const blueprintCatalogRequested = useRef(false);
  function ensureBlueprintCatalog() {
    if (blueprintCatalogRequested.current) return;
    blueprintCatalogRequested.current = true;
    void loadBlueprintCatalog()
      .then(setBlueprintCatalog)
      .catch(() => {
        // Build Plan action degrades to "No blueprint options" on failure — not core functionality.
      });
  }

  const [infoModalItem, setInfoModalItem] = useState<{ typeId: number; itemName: string } | null>(
    null
  );
  function handleShowInfo(typeId: number, itemName: string) {
    setInfoModalItem({ typeId, itemName });
  }

  const assetsResult = data?.assetsResult ?? null;
  const assetsTruncated = data?.assetsTruncated ?? false;
  const assetsNeedsReauth = data?.assetsNeedsReauth ?? false;
  const typeNames = data?.typeNames ?? NO_NAMES;
  const locationNames = data?.locationNames ?? NO_NAMES;
  const priceByTypeId = data?.priceByTypeId ?? NO_PRICES;
  const volumeByTypeId = data?.volumeByTypeId ?? NO_VOLUMES;

  // CSV export always stays scoped to the active Character's own assets,
  // regardless of the cross-character toggle — exporting another Character's
  // items without a character column would misattribute them.
  const csvAssetsByItemId = useMemo(
    () => new Map((assetsResult?.data ?? []).map((asset) => [asset.item_id, asset])),
    [assetsResult]
  );
  const csvGroups = useMemo(() => {
    const matches = matchAssets(assetsResult?.data ?? [], typeNames, search);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable from i18next
  }, [assetsResult, typeNames, locationNames, csvAssetsByItemId, search]);

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
  const mergedTypeNames = useMemo(() => {
    if (!activeCrossCharacterData) return typeNames;
    const merged = new Map(typeNames);
    for (const [id, name] of activeCrossCharacterData.typeNames) {
      if (!merged.has(id)) merged.set(id, name);
    }
    return merged;
  }, [typeNames, activeCrossCharacterData]);
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

  const routePreference = useRoutePreference((state) => state.value);
  const hydrateRoutePreference = useRoutePreference((state) => state.hydrate);
  const setRoutePreference = useRoutePreference((state) => state.setValue);
  useEffect(() => {
    void hydrateRoutePreference();
  }, [hydrateRoutePreference]);

  const stationSortField = useStationSort((state) => state.value);
  const hydrateStationSort = useStationSort((state) => state.hydrate);
  const setStationSortField = useStationSort((state) => state.setValue);
  useEffect(() => {
    void hydrateStationSort();
  }, [hydrateStationSort]);

  const [jumpsAwayByKey, setJumpsAwayByKey] = useState<ReadonlyMap<string, JumpsAwayResult>>(
    new Map()
  );

  // The tree is built from every asset, unpruned: search no longer filters it
  // (results are a separate flat list), so browsing always sees the whole
  // structure and clearing a search never has to rebuild it.
  const tree = useMemo(
    () => buildAssetTree(mergedAssets, priceByTypeId),
    [mergedAssets, priceByTypeId]
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
        (station) => jumpsAwayByKey.get(`${station.locationId}:${routePreference}`)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinStateFor closes over pins/activeCharacterId, listed explicitly instead
    [
      tree,
      stationLabelFor,
      mergedTypeNames,
      pins,
      activeCharacterId,
      stationSortField,
      jumpsAwayByKey,
      routePreference,
    ]
  );

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

  const searchMatches = useMemo(
    () => (searchActive ? matchAssets(mergedAssets, mergedTypeNames, search) : []),
    [searchActive, mergedAssets, mergedTypeNames, search]
  );

  // The three list shapes, reduced to one row array for one virtualizer.
  const rows = useMemo<BrowseRow[]>(() => {
    if (searchActive) {
      return searchMatches.map((match) => ({
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
    searchActive,
    searchMatches,
    pathStationId,
    resolved,
    sortedTree,
    pins,
    activeCharacterId,
    mergedLocationNames,
    t,
  ]);

  const scrollParentRef = useRef<HTMLDivElement>(null);
  // React Compiler isn't enabled in this build (no babel plugin configured);
  // this is eslint-plugin-react-hooks flagging TanStack Virtual's returned
  // functions as unsafe to memoize *if* the compiler is ever turned on.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => estimateRowHeight(rows[index]),
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
  }, [wildcard, searchActive]);

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

  // Locations with a row in the virtualizer's current visible range — the
  // "currently visible" half of CONTEXT.md round 14's "only for pinned and
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
  // range, and the location currently drilled into (CONTEXT.md round 14:
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

  // Each station's own solar system id (resolved once, then reused across a
  // preference switch) and the resulting jumps-away result per (station,
  // preference) pair — keying by preference means switching it never needs
  // an explicit cache invalidation, a stale entry under the old preference
  // is simply never read again. Both effects below guard against
  // re-requesting a key with a ref (not just the `pending` filter over
  // state): resolving one station's system id updates `stationSystemIds`,
  // which is itself a dependency of the jumps-away effect, so that effect
  // legitimately re-runs mid-flight for *other* still-pending stations — the
  // ref is what stops that re-run from re-issuing a request already inflight
  // for the same key, which the state-only filter cannot do since the write
  // that would exclude it hasn't landed yet.
  const [stationSystemIds, setStationSystemIds] = useState<ReadonlyMap<number, number | null>>(
    new Map()
  );
  // Security status (issue #148) piggybacks on `stationSystemIds`/
  // `jumpsAwayScopedStations` above rather than resolving its own scoped
  // station list: same station set, same reason to bound the fan-out
  // (CONTEXT.md round 14), keyed by system id (not station id) since two
  // stations can share a system and only need the lookup once.
  const [securityBySystemId, setSecurityBySystemId] = useState<ReadonlyMap<number, number | null>>(
    new Map()
  );
  const systemIdRequested = useRef<Set<number>>(new Set());
  const jumpsAwayRequested = useRef<Set<string>>(new Set());
  const securityRequested = useRef<Set<number>>(new Set());
  // Tracks which character an in-flight request was made for. A plain
  // per-effect `cancelled` closure would also be tripped by an *unrelated*
  // re-render that merely gives `jumpsAwayScopedStations`/`stationSystemIds`
  // a new array/Map identity with the same content (e.g. clicking a pin
  // writes to Dexie, which re-renders `pins` mid-flight) — since the
  // request is already marked in the refs above, that spurious cancellation
  // would discard the result and it would never be retried. Comparing
  // against the character a request was actually made for is the correct,
  // narrower staleness check: only a real character switch should discard
  // a write, and the reset effect below already clears state for that case.
  const activeCharacterIdRef = useRef(activeCharacterId);
  useEffect(() => {
    activeCharacterIdRef.current = activeCharacterId;
  }, [activeCharacterId]);
  useEffect(() => {
    // A fresh character is a fresh page context: a structure's system id is
    // ACL-checked per character, so a previous character's resolved/inflight
    // set must not suppress this one's requests.
    setStationSystemIds(new Map());
    setJumpsAwayByKey(new Map());
    setSecurityBySystemId(new Map());
    systemIdRequested.current = new Set();
    jumpsAwayRequested.current = new Set();
    securityRequested.current = new Set();
  }, [activeCharacterId]);

  useEffect(() => {
    if (activeCharacterId === null) return;
    const missing = jumpsAwayScopedStations.filter(
      (station) =>
        !stationSystemIds.has(station.locationId) &&
        !systemIdRequested.current.has(station.locationId)
    );
    if (missing.length === 0) return;
    for (const station of missing) systemIdRequested.current.add(station.locationId);

    const requestedForCharacterId = activeCharacterId;
    void mapWithConcurrencyLimit(missing, ESI_FANOUT_CONCURRENCY, async (station) => {
      const systemId =
        station.locationType === 'station'
          ? await loadStationSystemId(station.locationId)
          : station.locationType === 'other' ||
              // A resolved orphan (see isUnresolvedParent) is a structure id in
              // every case seen so far, so its system comes from the same call
              // that already resolved its name.
              (station.locationType === 'item' && mergedLocationNames.has(station.locationId))
            ? await loadStructureSystemId(activeCharacterId, station.locationId)
            : // `location_type: "solar_system"` already *is* the system id —
              // nothing to fetch.
              station.locationType === 'solar_system'
              ? station.locationId
              : null;
      if (activeCharacterIdRef.current === requestedForCharacterId) {
        setStationSystemIds((prev) => new Map(prev).set(station.locationId, systemId));
      }
    });
  }, [activeCharacterId, jumpsAwayScopedStations, stationSystemIds, mergedLocationNames]);

  useEffect(() => {
    if (activeCharacterId === null || !characterLocationResolved) return;
    const pending = jumpsAwayScopedStations.filter((station) => {
      const key = `${station.locationId}:${routePreference}`;
      if (jumpsAwayByKey.has(key) || jumpsAwayRequested.current.has(key)) return false;
      return characterSystemId === null || stationSystemIds.has(station.locationId);
    });
    if (pending.length === 0) return;
    for (const station of pending) {
      jumpsAwayRequested.current.add(`${station.locationId}:${routePreference}`);
    }

    const requestedForCharacterId = activeCharacterId;
    void mapWithConcurrencyLimit(pending, ESI_FANOUT_CONCURRENCY, async (station) => {
      const key = `${station.locationId}:${routePreference}`;
      let result: JumpsAwayResult;
      if (characterSystemId === null) {
        result = { kind: 'unknown', reason: 'noLocation' };
      } else {
        const systemId = stationSystemIds.get(station.locationId) ?? null;
        result =
          systemId === null
            ? { kind: 'unknown', reason: 'noRoute' }
            : await loadJumpsAway(characterSystemId, systemId, routePreference);
      }
      if (activeCharacterIdRef.current === requestedForCharacterId) {
        setJumpsAwayByKey((prev) => new Map(prev).set(key, result));
      }
    });
  }, [
    activeCharacterId,
    characterLocationResolved,
    characterSystemId,
    jumpsAwayScopedStations,
    jumpsAwayByKey,
    stationSystemIds,
    routePreference,
  ]);

  useEffect(() => {
    if (activeCharacterId === null) return;
    const missing = new Set<number>();
    for (const station of jumpsAwayScopedStations) {
      const systemId = stationSystemIds.get(station.locationId);
      if (
        systemId != null &&
        !securityBySystemId.has(systemId) &&
        !securityRequested.current.has(systemId)
      ) {
        missing.add(systemId);
      }
    }
    if (missing.size === 0) return;
    for (const systemId of missing) securityRequested.current.add(systemId);

    const requestedForCharacterId = activeCharacterId;
    void mapWithConcurrencyLimit([...missing], ESI_FANOUT_CONCURRENCY, async (systemId) => {
      const security = await loadSystemSecurity(systemId);
      if (activeCharacterIdRef.current === requestedForCharacterId) {
        setSecurityBySystemId((prev) => new Map(prev).set(systemId, security));
      }
    });
  }, [activeCharacterId, jumpsAwayScopedStations, stationSystemIds, securityBySystemId]);

  function securityForStation(locationId: number): number | null | undefined {
    const systemId = stationSystemIds.get(locationId);
    if (systemId == null) return systemId;
    return securityBySystemId.get(systemId);
  }

  // Bulk actions (issue #90): the three actions the item context menu already
  // offers per row, applied to every selected item_id at once. Quickbar and
  // Compare have different lifetimes (CONTEXT.md) — bulk-adding to Quickbar
  // schedules a sync, like `handleAddToQuickbar`; bulk-adding to Compare does
  // not, matching `ItemContextMenu`'s own single-item path.
  function handleBulkAddToQuickbar() {
    if (activeCharacterId === null) return;
    let items = quickbarItems;
    for (const id of selectedIds) {
      const asset = assetsByItemId.get(id);
      if (!asset) continue;
      const name = mergedTypeNames.get(asset.type_id) ?? `Type #${asset.type_id}`;
      items = addQuickbarItem(items, { typeId: asset.type_id, name });
    }
    void writeQuickbar(items);
  }
  function handleBulkAddToCompare() {
    const addToCompare = useCompareSet.getState().add;
    for (const id of selectedIds) {
      const asset = assetsByItemId.get(id);
      if (!asset) continue;
      const name = mergedTypeNames.get(asset.type_id) ?? `Type #${asset.type_id}`;
      addToCompare({ typeId: asset.type_id, itemName: name });
    }
  }
  function handleBulkCopyNames() {
    const names = namesForSelection([...selectedIds], assetsByItemId, mergedTypeNames);
    void writeToClipboard(names.join('\n'));
  }

  function handleExportCsv() {
    downloadCsv(
      'assets',
      assetCsvRows(
        csvGroups.map((group) => ({
          label: group.label,
          entries: group.entries.map((entry) => ({
            name: entry.name,
            quantity: entry.asset.quantity,
          })),
        }))
      ),
      assetsCsvColumns(t),
      new Date(),
      assetsTruncated
    );
  }

  const itemActions: AssetItemActions = {
    priceByTypeId,
    volumeByTypeId,
    blueprintCatalog,
    quickbarAvailable: activeCharacterId !== null,
    onRequestBlueprintCatalog: ensureBlueprintCatalog,
    onAddToQuickbar: handleAddToQuickbar,
    onShowInfo: handleShowInfo,
  };

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
          { label: stationLabelFor(resolved.station), href: assetPathHref(pathStationId, []) },
          ...resolved.trail.map((node, index) => ({
            label: nodeLabel(node),
            href: assetPathHref(
              pathStationId,
              resolved.trail.slice(0, index + 1).map(assetNodeSegment)
            ),
          })),
        ];
  const parentHref = crumbs.length > 1 ? crumbs[crumbs.length - 2].href : assetPathHref(null, []);
  // A leaf item carries no aggregate of its own — there is nothing below it to
  // total — so the header simply drops the counts at that depth.
  const deepest = resolved.trail[resolved.trail.length - 1] ?? resolved.station;
  const currentTotals =
    deepest && (!('kind' in deepest) || deepest.kind !== 'item') ? deepest : null;

  return (
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
      <PageHeader
        title={t('assets.title')}
        meta={assetsResult && <DataAgeBadge date={assetsResult.fetchedAt} />}
        actions={
          <>
            <div className="ml-auto flex items-center gap-1.5">
              {crossCharacterSearch && crossCharacterLoading && (
                <Spinner size="sm" label={t('assets.crossCharacterLoading')} />
              )}
              <IconButton
                icon={<Icon.AllCharacters />}
                label={t('assets.crossCharacterToggle')}
                pressed={crossCharacterSearch}
                onClick={() => setCrossCharacterSearch((v) => !v)}
              />
              <IconButton
                icon={<Icon.Select />}
                label={t('assets.select.toggle')}
                pressed={selectMode}
                onClick={toggleSelectMode}
              />
              <IconButton
                icon={<Icon.Download />}
                label={t('assets.exportCsv')}
                disabled={csvGroups.length === 0}
                onClick={handleExportCsv}
              />
              <IconButton
                icon={<Icon.Refresh />}
                label={t('assets.refresh')}
                disabled={loading}
                onClick={refresh}
              />
            </div>
          </>
        }
      />

      {!loading && assetsResult && !assetsNeedsReauth && (
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('assets.searchPlaceholder')}
        />
      )}

      {selectMode && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 px-3 py-2">
          <span className="text-[0.6875rem] text-text-dim tabular-nums">
            {t('assets.select.selectedCount', { count: selectedIds.size })}
          </span>
          <Button size="sm" disabled={activeCharacterId === null} onClick={handleBulkAddToQuickbar}>
            {t('assets.select.addToQuickbar')}
          </Button>
          <Button size="sm" onClick={handleBulkAddToCompare}>
            {t('assets.select.addToCompare')}
          </Button>
          <Button size="sm" onClick={handleBulkCopyNames}>
            {t('assets.select.copyNames')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label={t('common.loading')} />
        </div>
      ) : assetsNeedsReauth ? (
        <ReauthBanner
          title={t('assets.reauthTitle')}
          hint={t('assets.reauthHint')}
          actionLabel={t('assets.reauthAction')}
          onLogin={() => void beginEveLogin()}
        />
      ) : error ? (
        <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
      ) : !assetsResult ? (
        <EmptyState title={t('assets.emptyTitle')} hint={t('assets.emptyHint')} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {assetsResult.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}
          {assetsTruncated && (
            <p className="text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')} —{' '}
              {t('assets.fetchTruncatedNotice', { shown: assetsResult.data.length })}
            </p>
          )}

          <AssetItemActionsContext.Provider value={itemActions}>
            <Panel padded={false} fill className="flex min-h-0 flex-1 flex-col">
              {/* --- level header: breadcrumb when drilled in, sort controls at the root --- */}
              {searchActive ? (
                <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel-2 px-3 md:h-9">
                  <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('assets.search.resultCount', { count: searchMatches.length })}
                  </span>
                  <IconButton
                    icon={<Icon.Close />}
                    label={t('assets.search.clear')}
                    variant="plain"
                    size="sm"
                    className="ml-auto"
                    onClick={() => setSearch('')}
                  />
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
                    <span className="truncate text-sm font-semibold">
                      {crumbs.length > 0 ? crumbs[crumbs.length - 1].label : ''}
                    </span>
                    {crumbs.length > 1 && (
                      <span className="flex min-w-0 items-center gap-1 truncate text-[0.6875rem] text-text-faint">
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
                  {resolved.station &&
                    !isUnresolvedParent(resolved.station, mergedLocationNames) && (
                      <span className="hidden shrink-0 items-center gap-2 text-[0.6875rem] text-text-faint sm:flex">
                        <SecurityValue
                          security={securityForStation(resolved.station.locationId)}
                          t={t}
                        />
                        <JumpsAwayText
                          result={jumpsAwayByKey.get(
                            `${resolved.station.locationId}:${routePreference}`
                          )}
                          t={t}
                        />
                      </span>
                    )}
                  {currentTotals && (
                    <span className="shrink-0 text-[0.6875rem] text-text-faint tabular-nums">
                      <span className="hidden sm:inline">
                        {t('assets.itemCount', { count: currentTotals.itemCount })} ·{' '}
                      </span>
                      <span className="text-isk-pos">
                        {formatIsk(currentTotals.estimatedValue)}
                      </span>
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3 py-1.5">
                  <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                    {t('assets.section.locationCount', { count: sortedTree.length })}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Select
                      value={stationSortField}
                      onValueChange={(value) => void setStationSortField(value as StationSortField)}
                    >
                      <SelectTrigger aria-label={t('assets.stationSort.label')} className="w-32">
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
                      onValueChange={(value) => void setRoutePreference(value as RoutePreference)}
                    >
                      <SelectTrigger
                        aria-label={t('assets.jumpsAway.routePreference.label')}
                        className="w-28"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shortest">
                          {t('assets.jumpsAway.routePreference.shortest')}
                        </SelectItem>
                        <SelectItem value="safest">
                          {t('assets.jumpsAway.routePreference.safest')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* --- the list --- */}
              {resolved.unresolved.length > 0 ? (
                <EmptyState
                  title={t('assets.staleLink.title')}
                  hint={t('assets.staleLink.hint')}
                  className="py-8"
                  action={
                    <Button size="sm" onClick={() => void navigate(assetPathHref(null, []))}>
                      {t('assets.staleLink.action')}
                    </Button>
                  }
                />
              ) : rows.length === 0 ? (
                <EmptyState
                  title={searchActive ? t('assets.noResults') : t('assets.emptyLocation')}
                  className="py-8"
                />
              ) : (
                <div
                  ref={scrollParentRef}
                  data-virtual-scroll-root
                  aria-label={t('assets.treeLabel')}
                  className="min-h-0 flex-1 overflow-y-auto"
                >
                  <div
                    role="presentation"
                    style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const row = rows[virtualRow.index];
                      return (
                        <div
                          key={virtualRow.key}
                          data-index={virtualRow.index}
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
                            jumpsAwayFor={(locationId) =>
                              jumpsAwayByKey.get(`${locationId}:${routePreference}`)
                            }
                            pinStateFor={pinStateFor}
                            onTogglePin={(locationId) => void handleTogglePin(locationId)}
                            pathStationId={pathStationId}
                            pathSegments={pathSegments}
                            trailFor={trailFor}
                            rootStationIdFor={rootStationIdFor}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Panel>
          </AssetItemActionsContext.Provider>
        </div>
      )}

      {infoModalItem && (
        <ItemDetailModal
          typeId={infoModalItem.typeId}
          itemName={infoModalItem.itemName}
          onClose={() => setInfoModalItem(null)}
        />
      )}
    </div>
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
        href={assetPathHref(station.locationId, [])}
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

/** Split out so it can call `useAssetItemActions` — a heading/location row does not. */
function SearchMatchRow({
  match,
  t,
  characterBadges,
  securityForStation,
  trailFor,
  rootStationIdFor,
}: BrowseRowViewProps & { match: AssetMatch }) {
  const actions = useAssetItemActions();
  const { asset, name } = match;
  const rootStationId = rootStationIdFor(asset);
  return (
    <SearchResultRow
      name={name}
      quantity={asset.quantity}
      estimatedValue={estimatedValueFor(asset, actions.priceByTypeId)}
      trail={trailFor(asset)}
      security={rootStationId === null ? undefined : securityForStation(rootStationId)}
      href={assetPathHref(rootStationId, [])}
      characterBadge={characterBadgeFor(asset.item_id, characterBadges)}
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
}: BrowseRowViewProps & { node: AssetTreeNode }) {
  const actions = useAssetItemActions();
  const label = nodeLabel(node);
  const badge = node.kind === 'bay' ? null : characterBadgeFor(node.asset.item_id, characterBadges);

  if (node.kind !== 'item') {
    return (
      <ContainerRow
        href={assetPathHref(pathStationId, [...pathSegments, assetNodeSegment(node)])}
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
  const estimatedValue = estimatedValueFor(asset, actions.priceByTypeId);
  const blueprintTypeID =
    actions.blueprintCatalog === null
      ? undefined
      : (actions.blueprintCatalog.byProductTypeID.get(asset.type_id)?.blueprintTypeID ?? null);

  return (
    <ItemRow
      name={label}
      quantity={asset.quantity}
      unitVolume={actions.volumeByTypeId.get(asset.type_id)}
      estimatedValue={estimatedValue}
      characterBadge={badge}
      selectMode={selectMode}
      selectionState={selectedIds.has(asset.item_id) ? 'checked' : 'unchecked'}
      onToggleSelection={() => onToggleSelection([asset.item_id])}
      t={t}
      wrap={(children) => (
        <ItemContextMenu
          typeId={asset.type_id}
          itemName={label}
          blueprintTypeID={blueprintTypeID}
          onAddToQuickbar={actions.onAddToQuickbar}
          quickbarAvailable={actions.quickbarAvailable}
          onShowInfo={actions.onShowInfo}
          onOpenChange={(open) => {
            if (open) actions.onRequestBlueprintCatalog();
          }}
        >
          {children}
        </ItemContextMenu>
      )}
    />
  );
}
