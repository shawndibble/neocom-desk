import { useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, DataAgeBadge, EmptyState, Panel, ReauthBanner, Spinner } from '@/components/ui';
import { beginEveLogin } from '@/app/loginFlow';
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
import { buildAssetTree, type AssetTreeNode, type AssetTreeStation } from '@/engine/assetTree';

/** Rendered rows past this many and grouping/painting the list starts to lag. */
export const MAX_RENDERED_ASSETS = 1000;

/** Stable identity, so the fallback doesn't invalidate the grouping memo every render. */
const NO_NAMES: ReadonlyMap<number, string> = new Map();
const NO_PRICES: ReadonlyMap<number, number> = new Map();

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
  const typeNames = await loadTypeNames(typeIds);

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
  };
}

function nodeSegment(node: AssetTreeNode): string {
  return node.kind === 'bay' ? `b:${node.bay}` : `i:${node.asset.item_id}`;
}

/**
 * A leaf survives if its own name matches; a container/ship survives if its own name
 * matches OR at least one descendant does (so a non-matching ship isn't dropped out from
 * under a matching item inside it). This keeps search working without making it
 * tree-aware (no ancestor auto-expand) — that refinement is #82's job.
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

function sortStations(
  stations: readonly AssetTreeStation[],
  labelFor: (station: AssetTreeStation) => string,
  typeNames: ReadonlyMap<number, string>
): AssetTreeStation[] {
  return [...stations]
    .map((station) => ({ ...station, children: sortNodes(station.children, typeNames) }))
    .sort((a, b) => labelFor(a).localeCompare(labelFor(b)));
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

function renderAssetNode(
  node: AssetTreeNode,
  path: string,
  depth: number,
  ctx: RenderCtx
): ReactNode {
  if (node.kind === 'item') {
    const name = ctx.typeNames.get(node.asset.type_id) ?? `Type #${node.asset.type_id}`;
    return (
      <li
        key={path}
        style={{ paddingLeft: `${depth * 0.75 + 0.75}rem` }}
        className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs"
      >
        <span className="truncate">{name}</span>
        <span className="shrink-0 tabular-nums text-text-dim">
          {ctx.t('assets.quantity')} {node.asset.quantity.toLocaleString()}
        </span>
      </li>
    );
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

  const assetsResult = data?.assetsResult ?? null;
  const assetsTruncated = data?.assetsTruncated ?? false;
  const assetsNeedsReauth = data?.assetsNeedsReauth ?? false;
  const typeNames = data?.typeNames ?? NO_NAMES;
  const locationNames = data?.locationNames ?? NO_NAMES;
  const priceByTypeId = data?.priceByTypeId ?? NO_PRICES;

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
        typeNames
      ),
    [visibleTree, locationNames, assetsByItemId, typeNames, t]
  );

  function toggleKey(key: string) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function expandAll(station: AssetTreeStation, stationKey: string) {
    const keys = collectExpandableKeys(station.children, stationKey);
    setExpandedKeys((prev) => new Set([...prev, ...keys]));
  }

  function collapseAll(station: AssetTreeStation, stationKey: string) {
    const keys = new Set(collectExpandableKeys(station.children, stationKey));
    setExpandedKeys((prev) => new Set([...prev].filter((k) => !keys.has(k))));
  }

  const renderCtx: RenderCtx = { expandedKeys, onToggle: toggleKey, typeNames, t };

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
            sortedTree.map((station) => {
              const stationKey = `station:${station.locationId}`;
              const label = locationLabel(
                station.locationId,
                station.locationType,
                locationNames,
                assetsByItemId,
                typeNames,
                t
              );
              return (
                <Panel
                  key={station.locationId}
                  title={label}
                  padded={false}
                  actions={
                    <div className="flex items-center gap-2">
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
            })
          )}
        </>
      )}
    </div>
  );
}
