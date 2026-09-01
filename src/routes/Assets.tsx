import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  FilterChip,
  Panel,
  ReauthBanner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@/components/ui';
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
import {
  loadCharacterAssets,
  loadOtherCharactersAssets,
  type OtherCharacterAssets,
} from '@/features/character/assets';
import type { CachedResult } from '@/esi/cache';
import { loadStationName, loadStationSystemId } from '@/features/character/stations';
import { loadStructureName, loadStructureSystemId } from '@/features/character/structures';
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
import { formatVolume } from '@/features/market/format';
import { typeIconUrl } from '@/lib/eveImages';
import { loadTypes } from '@/sde/loadSde';
import {
  buildAssetTree,
  type AssetTreeBayNode,
  type AssetTreeContainerNode,
  type AssetTreeItemNode,
  type AssetTreeNode,
  type AssetTreeStation,
} from '@/engine/assetTree';
import {
  flattenAssetRows,
  nodeSegment,
  stationRowKey,
  type AssetRow,
} from '@/features/character/assetRows';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { addQuickbarItem } from '@/features/market/quickbar';
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

interface AssetMatch {
  asset: CharacterAsset;
  name: string;
}

/** Name-substring search over a flat asset list, shared by the CSV export path and the on-screen tree path. */
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

/**
 * Cross-character search (issue #85): who owns which row, relative to the
 * active Character — the three pieces always travel together, so they get
 * one field on `RenderCtx` instead of three. `EMPTY_CHARACTER_BADGES` below
 * is the off/inactive value: every row resolves to "no badge".
 */
interface CharacterBadgeContext {
  activeCharacterId: number | null;
  idByItemId: ReadonlyMap<number, number>;
  nameById: ReadonlyMap<number, string>;
}

interface RenderCtx {
  expandedKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  typeNames: ReadonlyMap<number, string>;
  t: Translate;
  characterBadges: CharacterBadgeContext;
}

function formatBadge(totals: { itemCount: number; estimatedValue: number }, t: Translate): string {
  return t('assets.nodeBadge', {
    count: totals.itemCount,
    value: formatIsk(totals.estimatedValue),
  });
}

/** The owning Character's name, only when it isn't the active Character — null means "no badge". */
function characterBadgeFor(itemId: number, ctx: RenderCtx): string | null {
  const { activeCharacterId, idByItemId, nameById } = ctx.characterBadges;
  const ownerId = idByItemId.get(itemId);
  if (ownerId === undefined || ownerId === activeCharacterId) return null;
  return nameById.get(ownerId) ?? null;
}

interface CharacterBadgeProps {
  characterName: string;
  t: Translate;
}

/** Small pill marking a tree row as belonging to a Character other than the active one. */
function CharacterBadge({ characterName, t }: CharacterBadgeProps) {
  return (
    <span
      className="ml-1.5 shrink-0 rounded-xs border border-line bg-panel-2 px-1 py-0.5 text-[0.625rem] text-text-dim"
      title={t('assets.crossCharacterBadge', { character: characterName })}
    >
      {characterName}
    </span>
  );
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

interface JumpsAwayBadgeProps {
  result: JumpsAwayResult | undefined;
  t: Translate;
}

/**
 * Jumps-away distance for a station row (issue #87). Renders nothing while
 * still resolving (undefined) rather than a placeholder — the badge is a
 * progressive enhancement that pops in once its route call settles, never a
 * load-blocking part of the row. `title` (not the hover-tooltip pattern used
 * elsewhere on this page) mirrors `CharacterBadge`'s own plain-annotation
 * treatment just above — this is the same kind of small supplementary label.
 */
function JumpsAwayBadge({ result, t }: JumpsAwayBadgeProps) {
  if (!result) return null;
  if (result.kind === 'known') {
    return (
      <span className="shrink-0 text-[0.6875rem] text-text-faint tabular-nums">
        {t('assets.jumpsAway.value', { count: result.jumps })}
      </span>
    );
  }
  return (
    <span
      className="shrink-0 text-[0.6875rem] text-text-faint tabular-nums"
      title={t(`assets.jumpsAway.unknownReason.${result.reason}`)}
    >
      {t('assets.jumpsAway.unknown')}
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
  const characterBadge = characterBadgeFor(asset.item_id, ctx);

  return (
    <div style={{ paddingLeft: `${depth * 0.75 + 0.75}rem` }}>
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
            <span className="flex min-w-0 items-center">
              <span className="truncate">{name}</span>
              {characterBadge && <CharacterBadge characterName={characterBadge} t={ctx.t} />}
            </span>
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
    </div>
  );
}

interface AssetBranchRowProps {
  node: AssetTreeBayNode | AssetTreeContainerNode;
  path: string;
  depth: number;
  ctx: RenderCtx;
}

/** A bay/container/ship row: toggles its own children's presence in the flattened row list. */
function AssetBranchRow({ node, path, depth, ctx }: AssetBranchRowProps) {
  const expanded = ctx.expandedKeys.has(path);
  const label =
    node.kind === 'bay'
      ? ctx.t(`assets.bay.${node.bay}`)
      : (ctx.typeNames.get(node.asset.type_id) ?? `Type #${node.asset.type_id}`);
  const characterBadge = node.kind === 'bay' ? null : characterBadgeFor(node.asset.item_id, ctx);

  return (
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
        <span className="truncate text-text-dim">{label}</span>
      ) : (
        <h3 className="truncate font-medium">{label}</h3>
      )}
      {characterBadge && <CharacterBadge characterName={characterBadge} t={ctx.t} />}
      <span className="ml-auto shrink-0 tabular-nums text-[0.6875rem] text-text-faint">
        {formatBadge(node, ctx.t)}
      </span>
    </button>
  );
}

interface StationHeaderRowProps {
  station: AssetTreeStation;
  label: string;
  pinState: PinState;
  /** Undefined while still resolving/out of scope (issue #87) — see `JumpsAwayBadge`. */
  jumpsAway: JumpsAwayResult | undefined;
  onTogglePin: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  t: Translate;
}

/**
 * Replaces the old per-station `Panel` header now that every station shares
 * one virtualizer: a boxed `Panel` per station can't wrap only its own rows
 * when all rows are absolutely-positioned siblings in one scroll container,
 * so this renders inline as just another row, styled to still read as a
 * section boundary (border-top, panel background) rather than a full box.
 */
function StationHeaderRow({
  station,
  label,
  pinState,
  jumpsAway,
  onTogglePin,
  onExpandAll,
  onCollapseAll,
  t,
}: StationHeaderRowProps) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-2 border-t border-line bg-panel/85 px-3 py-1 backdrop-blur-sm">
      <h2 className="truncate text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </h2>
      <div className="flex items-center gap-2">
        <StationPinButton label={label} pinState={pinState} onToggle={onTogglePin} t={t} />
        <JumpsAwayBadge result={jumpsAway} t={t} />
        <span className="text-[0.6875rem] text-text-faint tabular-nums">
          {formatBadge(station, t)}
        </span>
        <Button size="sm" onClick={onExpandAll}>
          {t('assets.expandAll')}
        </Button>
        <Button size="sm" onClick={onCollapseAll}>
          {t('assets.collapseAll')}
        </Button>
      </div>
    </div>
  );
}

/** Station header rows read taller (title + pin/badge/expand/collapse controls); every bay/container/ship/item row shares one `py-1.5 text-xs` row button, so one height covers all three. */
const STATION_ROW_HEIGHT = 41;
const TREE_ROW_HEIGHT = 32;

function estimateRowHeight(row: AssetRow): number {
  return row.type === 'station' ? STATION_ROW_HEIGHT : TREE_ROW_HEIGHT;
}

/** Character assets as a nested Station -> Ship/Container -> ... tree, with a name search filter. Read-only, cached for offline. */
export function Assets() {
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } =
    useRouteSnapshot(loadAssetsSnapshot);

  const [search, setSearch] = useState('');
  const searchActive = search.trim().length > 0;
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set());

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

  // Tree/on-screen matching: the active Character's own assets, plus every
  // other Character's when the cross-character toggle is on and a search is
  // active (see `crossCharacterActive` above) — merging is safe because
  // asset item_ids are globally unique across the whole game, not scoped to
  // one Character.
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

  // Every search match is rendered — the tree is virtualized (issue #86), so
  // there is no longer a render-cost reason to cap what's shown separately
  // from what ESI actually fetched (`assetsTruncated`, upstream, is unrelated
  // and stays as-is).
  const visibleItemIds = useMemo(() => {
    const matches = matchAssets(mergedAssets, mergedTypeNames, search);
    return new Set(matches.map((m) => m.asset.item_id));
  }, [mergedAssets, mergedTypeNames, search]);

  const tree = useMemo(
    () => buildAssetTree(mergedAssets, priceByTypeId),
    [mergedAssets, priceByTypeId]
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
            mergedLocationNames,
            assetsByItemId,
            mergedTypeNames,
            t
          ),
        mergedTypeNames,
        (station) => pinStateFor(station.locationId)
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinStateFor closes over pins/activeCharacterId, listed explicitly instead
    [visibleTree, mergedLocationNames, assetsByItemId, mergedTypeNames, t, pins, activeCharacterId]
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
        collectExpandableKeys(station.children, stationRowKey(station.locationId))
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
  const autoExpandedKeys = useMemo(() => {
    if (!searchActive) return null;
    const keys = new Set<string>();
    for (const station of sortedTree) {
      const stationKey = stationRowKey(station.locationId);
      for (const key of collectExpandableKeys(station.children, stationKey)) keys.add(key);
    }
    return keys;
  }, [searchActive, sortedTree]);

  // One flat row list — station headers and tree nodes interleaved in visual
  // order — feeds the single virtualizer below (issue #86). Search re-prunes
  // `sortedTree` above, which re-flattens here; there is no separate
  // search-specific row path. Computed here (rather than down by the render,
  // where the old pre-virtualization layout had it) because the jumps-away
  // scoping below needs the virtualizer's visible range.
  const effectiveExpandedKeys = autoExpandedKeys ?? expandedKeys;
  const flattenedRows = useMemo(
    () => flattenAssetRows(sortedTree, effectiveExpandedKeys),
    [sortedTree, effectiveExpandedKeys]
  );
  const scrollParentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: flattenedRows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => estimateRowHeight(flattenedRows[index]),
    getItemKey: (index) => flattenedRows[index].key,
    overscan: 12,
  });

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

  const routePreference = useRoutePreference((state) => state.value);
  const hydrateRoutePreference = useRoutePreference((state) => state.hydrate);
  const setRoutePreference = useRoutePreference((state) => state.setValue);
  useEffect(() => {
    void hydrateRoutePreference();
  }, [hydrateRoutePreference]);

  // Stations with at least one row (their own header, or a descendant) in
  // the virtualizer's current visible range — the "currently visible"
  // half of CONTEXT.md round 14's "only for pinned and currently
  // visible/expanded stations". Keyed on the range's indices, not
  // `getVirtualItems()`'s array (a fresh reference every render), so this
  // only recomputes when the visible window actually moves.
  const rangeStart = rowVirtualizer.range?.startIndex ?? null;
  const rangeEnd = rowVirtualizer.range?.endIndex ?? null;
  const visibleStationLocationIds = useMemo(() => {
    if (rangeStart === null || rangeEnd === null) return new Set<number>();
    const ids = new Set<number>();
    for (let i = rangeStart; i <= rangeEnd; i += 1) {
      const row = flattenedRows[i];
      if (!row) continue;
      ids.add(row.type === 'station' ? row.station.locationId : row.stationLocationId);
    }
    return ids;
  }, [rangeStart, rangeEnd, flattenedRows]);

  // Lazy, scoped to pinned stations, stations in the virtualizer's visible
  // range, and stations the user has actually drilled into (CONTEXT.md round
  // 14: "only for pinned and currently visible/expanded stations") — bounds
  // the route-call fan-out to what's pinned or actually on screen, rather
  // than every station a character owns.
  const jumpsAwayScopedStations = useMemo(() => {
    return sortedTree.filter((station) => {
      if (pinStateFor(station.locationId) !== 'unpinned') return true;
      if (visibleStationLocationIds.has(station.locationId)) return true;
      const prefix = `${stationRowKey(station.locationId)}/`;
      for (const key of effectiveExpandedKeys) {
        if (key.startsWith(prefix)) return true;
      }
      return false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinStateFor closes over pins/activeCharacterId, listed explicitly instead
  }, [sortedTree, effectiveExpandedKeys, visibleStationLocationIds, pins, activeCharacterId]);

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
  const [jumpsAwayByKey, setJumpsAwayByKey] = useState<ReadonlyMap<string, JumpsAwayResult>>(
    new Map()
  );
  const systemIdRequested = useRef<Set<number>>(new Set());
  const jumpsAwayRequested = useRef<Set<string>>(new Set());
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
    systemIdRequested.current = new Set();
    jumpsAwayRequested.current = new Set();
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
          : station.locationType === 'other'
            ? await loadStructureSystemId(activeCharacterId, station.locationId)
            : null;
      if (activeCharacterIdRef.current === requestedForCharacterId) {
        setStationSystemIds((prev) => new Map(prev).set(station.locationId, systemId));
      }
    });
  }, [activeCharacterId, jumpsAwayScopedStations, stationSystemIds]);

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
    expandedKeys: effectiveExpandedKeys,
    onToggle: toggleKey,
    typeNames: mergedTypeNames,
    t,
    characterBadges,
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
              <SelectItem value="safest">{t('assets.jumpsAway.routePreference.safest')}</SelectItem>
            </SelectContent>
          </Select>
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
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('assets.searchPlaceholder')}
            className="h-9 min-w-48 flex-1 rounded-xs border border-line bg-panel-2 px-3 text-xs text-text placeholder:text-text-faint focus-visible:outline-2 focus-visible:outline-accent"
          />
          <FilterChip
            label={t('assets.crossCharacterToggle')}
            selected={crossCharacterSearch}
            onToggle={() => setCrossCharacterSearch((v) => !v)}
          />
          {crossCharacterSearch && crossCharacterLoading && (
            <Spinner size="sm" label={t('assets.crossCharacterLoading')} />
          )}
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
          {sortedTree.length === 0 ? (
            <EmptyState title={t('assets.noResults')} className="py-8" />
          ) : (
            <AssetItemActionsContext.Provider value={itemActions}>
              <Panel padded={false}>
                <div
                  ref={scrollParentRef}
                  data-virtual-scroll-root
                  className="max-h-[32rem] overflow-y-auto"
                >
                  <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                      const row = flattenedRows[virtualRow.index];
                      const label =
                        row.type === 'station'
                          ? locationLabel(
                              row.station.locationId,
                              row.station.locationType,
                              mergedLocationNames,
                              assetsByItemId,
                              mergedTypeNames,
                              t
                            )
                          : null;
                      return (
                        <div
                          key={virtualRow.key}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          {row.type === 'station' ? (
                            <StationHeaderRow
                              station={row.station}
                              label={label as string}
                              pinState={pinStateFor(row.station.locationId)}
                              jumpsAway={jumpsAwayByKey.get(
                                `${row.station.locationId}:${routePreference}`
                              )}
                              onTogglePin={() => void handleTogglePin(row.station.locationId)}
                              onExpandAll={() =>
                                expandAll(row.station, stationRowKey(row.station.locationId))
                              }
                              onCollapseAll={() =>
                                collapseAll(row.station, stationRowKey(row.station.locationId))
                              }
                              t={t}
                            />
                          ) : row.node.kind === 'item' ? (
                            <AssetItemRow node={row.node} depth={row.depth} ctx={renderCtx} />
                          ) : (
                            <AssetBranchRow
                              node={row.node}
                              path={row.key}
                              depth={row.depth}
                              ctx={renderCtx}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Panel>
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
