import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button, DataAgeBadge, EmptyState, Panel, ReauthBanner, Spinner } from '@/components/ui';
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
import { useHoverTooltip } from '@/lib/useHoverTooltip';
import { nextPinState, pinStateForStation, type PinState } from '@/features/character/stationPins';
import { loadCharacterAssets } from '@/features/character/assets';
import type { CachedResult } from '@/esi/cache';
import { loadStationName } from '@/features/character/stations';
import { loadStructureName } from '@/features/character/structures';
import { loadTypeNames } from '@/features/character/typeNames';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import type { CharacterAsset } from '@/esi/endpoints';
import { capItems } from '@/lib/cap';
import { downloadCsv } from '@/lib/downloadCsv';
import { assetCsvRows, assetsCsvColumns } from '@/features/character/assetsCsv';
import { getAdjustedPrices } from '@/market/prices';
import { formatIsk } from '@/lib/isk';
import { formatVolume } from '@/features/market/format';
import { typeIconUrl } from '@/lib/eveImages';
import { loadTypes } from '@/sde/loadSde';
import {
  buildAssetTree,
  type AssetTreeItemNode,
  type AssetTreeNode,
  type AssetTreeStation,
} from '@/engine/assetTree';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { addQuickbarItem } from '@/features/market/quickbar';
import { loadBlueprintCatalog, type BlueprintCatalog } from '@/features/industry/blueprintCatalog';

/** Rendered rows past this many and grouping/painting the list starts to lag. */
export const MAX_RENDERED_ASSETS = 1000;

/** Stable identity, so the fallback doesn't invalidate the grouping memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_PRICES: ReadonlyMap<number, number> = new Map();
const NO_VOLUMES: ReadonlyMap<number, number> = new Map();

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
  if (locationType === 'solar_system') return t('assets.inSpaceLabel', { id: locationId });
  if (locationType === 'item') {
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
  const [resolvedStations, resolvedStructures] = await Promise.all([
    Promise.all(stationIds.map((id) => loadStationName(id))),
    Promise.all(structureIds.map((id) => loadStructureName(characterId, id))),
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

function nodeSegment(node: AssetTreeNode): string {
  return node.kind === 'bay' ? `b:${node.bay}` : `i:${node.asset.item_id}`;
}

/**
 * A leaf survives if its own name matches; a container/ship survives if its own name
 * matches OR at least one descendant does (so a non-matching ship isn't dropped out from
 * under a matching item inside it). Ancestor auto-expand for the surviving tree is handled
 * separately, in the `autoExpandedKeys` computation below.
 */
function pruneNode(node: AssetTreeNode, visibleItemIds: ReadonlySet<number>): AssetTreeNode | null {
  if (node.kind === 'item') return visibleItemIds.has(node.asset.item_id) ? node : null;

  const children = node.children
    .map((child) => pruneNode(child, visibleItemIds))
    .filter((child): child is AssetTreeNode => child !== null);

  if (node.kind === 'bay') return children.length > 0 ? { ...node, children } : null;

  const ownMatch = visibleItemIds.has(node.asset.item_id);
  if (!ownMatch && children.length === 0) return null;
  return { ...node, children };
}

function pruneStations(
  stations: readonly AssetTreeStation[],
  visibleItemIds: ReadonlySet<number>
): AssetTreeStation[] {
  const result: AssetTreeStation[] = [];
  for (const station of stations) {
    const children = station.children
      .map((child) => pruneNode(child, visibleItemIds))
      .filter((child): child is AssetTreeNode => child !== null);
    if (children.length > 0) result.push({ ...station, children });
  }
  return result;
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

/** Pinned stations (either scope) sort ahead of unpinned ones; each group stays alphabetical. */
function sortStations(
  stations: readonly AssetTreeStation[],
  labelFor: (station: AssetTreeStation) => string,
  typeNames: ReadonlyMap<number, string>,
  pinStateFor: (station: AssetTreeStation) => PinState
): AssetTreeStation[] {
  return [...stations]
    .map((station) => ({ ...station, children: sortNodes(station.children, typeNames) }))
    .sort((a, b) => {
      const pinnedA = pinStateFor(a) !== 'unpinned';
      const pinnedB = pinStateFor(b) !== 'unpinned';
      if (pinnedA !== pinnedB) return pinnedA ? -1 : 1;
      return labelFor(a).localeCompare(labelFor(b));
    });
}

function collectExpandableKeys(nodes: readonly AssetTreeNode[], parentPath: string): string[] {
  const keys: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'item') continue;
    const path = `${parentPath}/${nodeSegment(node)}`;
    keys.push(path, ...collectExpandableKeys(node.children, path));
  }
  return keys;
}

interface RenderCtx {
  expandedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  typeNames: ReadonlyMap<number, string>;
  t: Translate;
}

function formatBadge(totals: { itemCount: number; estimatedValue: number }, t: Translate): string {
  return t('assets.nodeBadge', {
    count: totals.itemCount,
    value: formatIsk(totals.estimatedValue),
  });
}

interface StationPinButtonProps {
  label: string;
  pinState: PinState;
  onToggle: () => void;
  t: Translate;
}

/**
 * Station pin toggle (issue #84): cycles unpinned -> pinned-for-this-character
 * -> pinned-account-wide -> unpinned. Both pinned states use the `accent`
 * family (a stronger, filled treatment for account-wide, since it's the more
 * far-reaching of the two) rather than `warning` — DESIGN.md reserves that
 * token for caution states (stale data, low skill), and an account-wide pin
 * is a deliberate elevated choice, not a caution. `aria-pressed` follows the
 * `FilterChip` toggle-button precedent (DESIGN.md); the finer character-vs-
 * account distinction is carried by the label/tooltip text, not by
 * `aria-pressed` itself (only true/false/mixed, none of which map cleanly to
 * "which of two pinned states").
 */
function StationPinButton({ label, pinState, onToggle, t }: StationPinButtonProps) {
  const { tooltipOpen, tooltipId, triggerHandlers } = useHoverTooltip();
  const tooltipText = t(`assets.pin.${pinState}`);
  const glyph = pinState === 'unpinned' ? '☆' : pinState === 'character' ? '★' : '✦';

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-pressed={pinState !== 'unpinned'}
        aria-label={t('assets.pin.ariaLabel', { station: label, state: tooltipText })}
        onClick={onToggle}
        {...triggerHandlers}
        className={cx(
          'flex size-7 shrink-0 items-center justify-center rounded-xs border text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          pinState === 'account'
            ? 'border-accent bg-accent text-accent-contrast'
            : pinState === 'character'
              ? 'border-accent-dim bg-accent/15 text-accent'
              : 'border-line bg-panel-2 text-text-dim hover:border-line-bright hover:text-text'
        )}
      >
        <span aria-hidden="true">{glyph}</span>
      </button>
      {tooltipOpen && (
        <span
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max max-w-56 -translate-x-1/2 rounded-xs border border-line bg-panel px-2 py-1 text-[0.6875rem] font-normal text-text-dim normal-case shadow-lg shadow-black/50"
        >
          {tooltipText}
        </span>
      )}
    </span>
  );
}

/**
 * The item context menu's actions and their supporting data (Quickbar,
 * blueprint catalog, tooltip pricing/volume) — everything an `AssetItemRow`
 * needs but a plain-recursion-threaded `RenderCtx` cannot carry. Reaching
 * these through `useContext` rather than another `ctx` field matters beyond
 * style: the React Compiler's purity/refs checks can verify a value read via
 * Context is deferred to event time, but lose that guarantee for a closure
 * (over a ref, or over an impure call like `Date.now()`) that merely rides
 * along inside a plain object passed through ordinary function calls.
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
  if (!actions) throw new Error('AssetItemRow rendered outside its actions provider');
  return actions;
}

interface AssetItemRowProps {
  node: AssetTreeItemNode;
  depth: number;
  ctx: RenderCtx;
}

/**
 * A leaf asset row: hover/focus reveals a tooltip (name, icon, quantity,
 * estimated value, volume) and right-click opens the shared item context
 * menu (`ItemContextMenu`, also used by the Market Browser — issue #83). The
 * tooltip bubble only mounts while active rather than always-rendered-but-
 * hidden (the pattern `Tooltip` uses elsewhere): an unvirtualized tree can
 * hold thousands of these rows, and paying render cost for a bubble nobody is
 * looking at doesn't scale the way it does for the handful of static tooltips
 * that component serves.
 */
function AssetItemRow({ node, depth, ctx }: AssetItemRowProps) {
  const { tooltipOpen, tooltipId, triggerHandlers } = useHoverTooltip();
  const actions = useAssetItemActions();
  const { asset } = node;
  const name = ctx.typeNames.get(asset.type_id) ?? `Type #${asset.type_id}`;
  const unitVolume = actions.volumeByTypeId.get(asset.type_id);
  const estimatedValue = asset.quantity * (actions.priceByTypeId.get(asset.type_id) ?? 0);
  const blueprintTypeID =
    actions.blueprintCatalog === null
      ? undefined
      : (actions.blueprintCatalog.byProductTypeID.get(asset.type_id)?.blueprintTypeID ?? null);

  return (
    <li style={{ paddingLeft: `${depth * 0.75 + 0.75}rem` }}>
      <ItemContextMenu
        typeId={asset.type_id}
        itemName={name}
        blueprintTypeID={blueprintTypeID}
        onAddToQuickbar={actions.onAddToQuickbar}
        quickbarAvailable={actions.quickbarAvailable}
        onShowInfo={actions.onShowInfo}
        onOpenChange={(open) => {
          if (open) actions.onRequestBlueprintCatalog();
        }}
      >
        {/* The tooltip bubble is a sibling of the button, not a descendant —
            nested inside, its text would fold into the button's accessible
            name (computed from its content, since it has no aria-label of
            its own) whenever the tooltip is open. */}
        <span className="group relative block">
          <button
            type="button"
            {...triggerHandlers}
            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="truncate">{name}</span>
            <span className="shrink-0 tabular-nums text-text-dim">
              {ctx.t('assets.quantity')} {asset.quantity.toLocaleString()}
            </span>
          </button>
          {tooltipOpen && (
            <span
              id={tooltipId}
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 w-64 rounded-xs border border-line bg-panel p-2 text-left text-[0.6875rem] font-normal text-text-dim normal-case shadow-lg shadow-black/50"
            >
              <span className="flex items-center gap-2">
                <img
                  src={typeIconUrl(asset.type_id, 32)}
                  alt=""
                  width={32}
                  height={32}
                  className="shrink-0 rounded-xs border border-line"
                />
                <span className="truncate font-medium text-text">{name}</span>
              </span>
              <span className="mt-1 block">
                {ctx.t('assets.quantity')} {asset.quantity.toLocaleString()}
              </span>
              <span className="block">
                {ctx.t('assets.tooltip.value', { value: formatIsk(estimatedValue) })}
              </span>
              <span className="block">
                {unitVolume === undefined
                  ? ctx.t('assets.tooltip.volumeUnknown')
                  : ctx.t('assets.tooltip.volume', { volume: formatVolume(unitVolume) })}
              </span>
            </span>
          )}
        </span>
      </ItemContextMenu>
    </li>
  );
}

function renderAssetNode(
  node: AssetTreeNode,
  path: string,
  depth: number,
  ctx: RenderCtx
): ReactNode {
  if (node.kind === 'item') {
    return <AssetItemRow key={path} node={node} depth={depth} ctx={ctx} />;
  }

  const expanded = ctx.expandedKeys.has(path);
  const label =
    node.kind === 'bay'
      ? ctx.t(`assets.bay.${node.bay}`)
      : (ctx.typeNames.get(node.asset.type_id) ?? `Type #${node.asset.type_id}`);

  return (
    <li key={path}>
      <button
        type="button"
        onClick={() => ctx.onToggle(path)}
        style={{ paddingLeft: `${depth * 0.75}rem` }}
        className="flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-xs text-text hover:text-accent"
      >
        <span aria-hidden="true" className="w-3 shrink-0 text-text-faint">
          {expanded ? '▾' : '▸'}
        </span>
        {node.kind === 'bay' ? (
          <span className="text-text-dim">{label}</span>
        ) : (
          <h3 className="truncate font-medium">{label}</h3>
        )}
        <span className="ml-auto shrink-0 tabular-nums text-[0.6875rem] text-text-faint">
          {formatBadge(node, ctx.t)}
        </span>
      </button>
      {expanded && (
        <ul>
          {node.children.map((child) =>
            renderAssetNode(child, `${path}/${nodeSegment(child)}`, depth + 1, ctx)
          )}
        </ul>
      )}
    </li>
  );
}

/** Character assets as a nested Station -> Ship/Container -> ... tree, with a name search filter. Read-only, cached for offline. */
export function Assets() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadAssetsSnapshot);

  const [search, setSearch] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set());

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

  const assetsByItemId = useMemo(
    () => new Map((assetsResult?.data ?? []).map((asset) => [asset.item_id, asset])),
    [assetsResult]
  );

  const { csvGroups, shownCount, totalMatches, visibleItemIds } = useMemo(() => {
    const items = assetsResult?.data ?? [];
    const query = search.trim().toLowerCase();

    const matches: { asset: CharacterAsset; name: string }[] = [];
    for (const asset of items) {
      const name = typeNames.get(asset.type_id) ?? `Type #${asset.type_id}`;
      if (query && !name.toLowerCase().includes(query)) continue;
      matches.push({ asset, name });
    }
    const capped = capItems(matches, MAX_RENDERED_ASSETS);

    const groupEntries = (entries: readonly { asset: CharacterAsset; name: string }[]) => {
      const byLocation = new Map<number, { asset: CharacterAsset; name: string }[]>();
      for (const entry of entries) {
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
            assetsByItemId,
            typeNames,
            t
          ),
          entries: locationEntries.sort((a, b) => a.name.localeCompare(b.name)),
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    };

    // Rendering caps at MAX_RENDERED_ASSETS for paint performance; CSV export
    // uses the full matched set (still respecting `search`) — a UI cap must
    // never silently drop rows from the exported file.
    return {
      csvGroups: groupEntries(matches),
      shownCount: capped.items.length,
      totalMatches: matches.length,
      visibleItemIds: new Set(capped.items.map((m) => m.asset.item_id)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is stable from i18next
  }, [assetsResult, typeNames, locationNames, assetsByItemId, search]);

  const renderTruncated = shownCount < totalMatches;

  // Aggregates (itemCount/estimatedValue) are computed from the full, uncapped asset
  // list so a badge always reflects the character's true holdings — only the rendered
  // rows are capped/filtered, via pruning below.
  const tree = useMemo(
    () => buildAssetTree(assetsResult?.data ?? [], priceByTypeId),
    [assetsResult, priceByTypeId]
  );
  const visibleTree = useMemo(() => pruneStations(tree, visibleItemIds), [tree, visibleItemIds]);
  const sortedTree = useMemo(
    () =>
      sortStations(
        visibleTree,
        (station) =>
          locationLabel(
            station.locationId,
            station.locationType,
            locationNames,
            assetsByItemId,
            typeNames,
            t
          ),
        typeNames,
        (station) => pinStateFor(station.locationId)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinStateFor closes over pins/activeCharacterId, listed explicitly instead
    [visibleTree, locationNames, assetsByItemId, typeNames, t, pins, activeCharacterId]
  );

  // Pinned stations start expanded on page load (issue #84) — the same effect
  // as clicking "Expand All" on each pinned station, seeded once pins and the
  // tree are both available so a later manual collapse isn't fought on every
  // render. Re-arms itself if the active character changes (a fresh page
  // context, in effect). Seeded during render (React's "adjusting state on a
  // change" pattern: https://react.dev/learn/you-might-not-need-an-effect),
  // not a useEffect — the guard below makes it run at most once per character
  // before the extra render settles, and an effect would only add a redundant
  // commit-then-setState round trip for a plain derived seed.
  const [pinnedSeededForCharacter, setPinnedSeededForCharacter] = useState<number | null>(null);
  if (
    activeCharacterId !== null &&
    pinsQuery !== undefined &&
    sortedTree.length > 0 &&
    pinnedSeededForCharacter !== activeCharacterId
  ) {
    setPinnedSeededForCharacter(activeCharacterId);
    const pinnedKeys = sortedTree
      .filter((station) => pinStateFor(station.locationId) !== 'unpinned')
      .flatMap((station) =>
        collectExpandableKeys(station.children, `station:${station.locationId}`)
      );
    if (pinnedKeys.length > 0) {
      setExpandedKeys((prev) => new Set([...prev, ...pinnedKeys]));
    }
  }

  // While searching, every surviving branch is by construction an ancestor of a match
  // (pruneStations already dropped anything that isn't) — force it open so the match is
  // visible without the user pre-expanding the right path. Toggling/expand-all/collapse-all
  // are no-ops during search so the manual `expandedKeys` state underneath stays untouched,
  // and clearing the search restores the prior expand/collapse state exactly.
  const searchActive = search.trim().length > 0;
  const autoExpandedKeys = useMemo(() => {
    if (!searchActive) return null;
    const keys = new Set<string>();
    for (const station of sortedTree) {
      const stationKey = `station:${station.locationId}`;
      for (const key of collectExpandableKeys(station.children, stationKey)) keys.add(key);
    }
    return keys;
  }, [searchActive, sortedTree]);

  function toggleKey(key: string) {
    if (searchActive) return;
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandAll(station: AssetTreeStation, stationKey: string) {
    if (searchActive) return;
    const keys = collectExpandableKeys(station.children, stationKey);
    setExpandedKeys((prev) => new Set([...prev, ...keys]));
  }

  function collapseAll(station: AssetTreeStation, stationKey: string) {
    if (searchActive) return;
    const keys = new Set(collectExpandableKeys(station.children, stationKey));
    setExpandedKeys((prev) => new Set([...prev].filter((k) => !keys.has(k))));
  }

  const renderCtx: RenderCtx = {
    expandedKeys: autoExpandedKeys ?? expandedKeys,
    onToggle: toggleKey,
    typeNames,
    t,
  };
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-widest uppercase">{t('assets.title')}</h1>
        <div className="flex items-center gap-2">
          {assetsResult && <DataAgeBadge date={assetsResult.fetchedAt} />}
          <Button
            size="sm"
            disabled={csvGroups.length === 0}
            onClick={() =>
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
              )
            }
          >
            {t('assets.exportCsv')}
          </Button>
          <Button size="sm" onClick={refresh} disabled={loading}>
            {t('assets.refresh')}
          </Button>
        </div>
      </header>

      {!loading && assetsResult && !assetsNeedsReauth && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('assets.searchPlaceholder')}
          className="h-9 w-full rounded-xs border border-line bg-panel-2 px-3 text-xs text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
        />
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
        <>
          {assetsResult.fromCache && (
            <p className="text-[0.6875rem] text-warning uppercase">{t('common.offlineTitle')}</p>
          )}
          {assetsTruncated && (
            <p className="text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')} —{' '}
              {t('assets.fetchTruncatedNotice', { shown: assetsResult.data.length })}
            </p>
          )}
          {renderTruncated && (
            <p className="text-[11px] text-warning uppercase">
              {t('assets.renderTruncatedNotice', { shown: shownCount, total: totalMatches })}
            </p>
          )}
          {sortedTree.length === 0 ? (
            <EmptyState title={t('assets.noResults')} className="py-8" />
          ) : (
            <AssetItemActionsContext.Provider value={itemActions}>
              {sortedTree.map((station) => {
                const stationKey = `station:${station.locationId}`;
                const label = locationLabel(
                  station.locationId,
                  station.locationType,
                  locationNames,
                  assetsByItemId,
                  typeNames,
                  t
                );
                const pinState = pinStateFor(station.locationId);
                return (
                  <Panel
                    key={station.locationId}
                    title={label}
                    padded={false}
                    actions={
                      <div className="flex items-center gap-2">
                        <StationPinButton
                          label={label}
                          pinState={pinState}
                          onToggle={() => void handleTogglePin(station.locationId)}
                          t={t}
                        />
                        <span className="text-[0.6875rem] text-text-faint tabular-nums">
                          {formatBadge(station, t)}
                        </span>
                        <Button size="sm" onClick={() => expandAll(station, stationKey)}>
                          {t('assets.expandAll')}
                        </Button>
                        <Button size="sm" onClick={() => collapseAll(station, stationKey)}>
                          {t('assets.collapseAll')}
                        </Button>
                      </div>
                    }
                  >
                    <ul className="divide-y divide-line">
                      {station.children.map((node) =>
                        renderAssetNode(node, `${stationKey}/${nodeSegment(node)}`, 0, renderCtx)
                      )}
                    </ul>
                  </Panel>
                );
              })}
            </AssetItemActionsContext.Provider>
          )}
        </>
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
