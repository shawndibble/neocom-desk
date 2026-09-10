/**
 * `/corp/assets` — every item the corporation owns, browsed the same
 * virtualized, URL-addressable way `/assets` is (issue #779).
 *
 * Round 41/44 (CONTEXT.md) rejected this: a hangar division has no `item_id`
 * for `engine/assetPath.ts` to key a URL on, and `engine/assetTree.ts` had no
 * grouping level between a station and a container to express one. Neither
 * held up against the fact the tree engine already solves an identical
 * problem for bay nodes — grouped by `location_flag`, addressed by kind
 * rather than an asset id it doesn't have. `buildCorpAssetTree`
 * (`engine/corp/assetDivisions.ts`) and `resolveCorpAssetPath`
 * (`engine/corp/assetPath.ts`) generalize exactly that mechanism to
 * divisions/flag groups as the top axis, in place of `groupCorpAssets`'s flat
 * `DataTable`-per-`Disclosure` grouping. See `docs/context/decisions/` for
 * the decision reversing round 41/44.
 *
 * **Director-only, and the whole page rather than a panel**, for the same
 * reason `/corp/members` is: `canReadAssets` (`engine/corpRoles.ts`) answers
 * to `Director` alone, so anyone else following an Assets tab would land on
 * an explanation instead of a division list. The `unknown`/`ready` split and
 * the mount-on-`ready` reasoning live in `useCorpRouteGate`, shared with
 * `/corp` and `/corp/members`.
 *
 * Deliberately smaller than `/assets`: no cross-character merge (a
 * corporation has one asset list, not one per character), no station
 * pinning, security/jumps-away badges, or "all items" flat toggle (no
 * corp-side need identified for this ticket — a plain search already
 * flattens every division into one result list on demand). Blueprint/build
 * plan linking stays explicitly disabled (`blueprintTypeID={null}`), same as
 * before this rework — corp assets still never loads the blueprint catalog.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataAgeBadge,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { CorpSubNav } from '@/features/corp/CorpSubNav';
import { loadCorporationId } from '@/features/corp/boardData';
import {
  EMPTY_CORP_ASSET_LABELS,
  loadCorporationAssets,
  loadCorpAssetLabels,
  toCorpAssetInputs,
  type CorpAssetLabels,
} from '@/features/corp/assets';
import { loadCorporationDivisions } from '@/features/corp/wallet';
import { hangarDivisions } from '@/features/corp/divisions';
import {
  buildCorpAssetTree,
  type CorpAssetGroupId,
  type CorpAssetInput,
} from '@/engine/corp/assetDivisions';
import {
  corpAssetPathHref,
  parseCorpAssetPath,
  resolveCorpAssetPath,
} from '@/engine/corp/assetPath';
import { assetNodeSegment } from '@/engine/assetPath';
import {
  collectGroupItemIds,
  collectItemIds,
  type AssetTreeGroup,
  type AssetTreeNode,
} from '@/engine/assetTree';
import {
  namesForSelection,
  selectAll,
  selectionStateForIds,
  toggleSelection,
} from '@/features/character/assetSelection';
import {
  ContainerRow,
  ItemRow,
  LocationRow,
  SearchResultRow,
} from '@/features/character/assetBrowserRows';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { ItemDetailModal } from '@/features/market/ItemDetailModal';
import { useQuickbar } from '@/features/market/useQuickbar';
import { useCompareSet } from '@/features/market/compareSet';
import { writeToClipboard } from '@/lib/clipboard';
import { downloadCsv } from '@/lib/downloadCsv';
import { assetCsvRows, assetsCsvColumns } from '@/features/character/assetsCsv';
import { getAdjustedPrices } from '@/market/prices';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

const SEARCH_DEBOUNCE_MS = 250;
const EMPTY_PRICES: ReadonlyMap<number, number> = new Map();
const EMPTY_DIVISION_NAMES: ReadonlyMap<number, string | null> = new Map();

interface AssetsSnapshot {
  corporationId: number | null;
  /** Raw, ESI-shaped input — kept alongside `groups` so bulk actions and search can look an item up by id without re-walking the tree. */
  inputs: CorpAssetInput[] | null;
  /**
   * `null` means the assets read itself did not come back — offline,
   * uncached, or a 403 the role gate swallowed — and is distinct from a
   * corporation that was read successfully and genuinely owns nothing.
   */
  groups: AssetTreeGroup<CorpAssetGroupId>[] | null;
  /** Division number -> the corp's own name for it, or null if unnamed/unresolved. */
  divisionNames: ReadonlyMap<number, string | null>;
  labels: CorpAssetLabels;
  /** Global average market price per type, best-effort — an outage degrades ISK badges to 0 rather than the whole page. */
  priceByTypeId: ReadonlyMap<number, number>;
  /** The page cap was hit or a page was missing — corp holdings are the likelier of the two lists to hit it. */
  truncated: boolean;
  assetsShown: number;
  /** Oldest `fetchedAt` across the reads — the badge speaks for the whole view. */
  fetchedAt: Date | null;
}

const EMPTY_SNAPSHOT: AssetsSnapshot = {
  corporationId: null,
  inputs: null,
  groups: null,
  divisionNames: new Map(),
  labels: EMPTY_CORP_ASSET_LABELS,
  priceByTypeId: new Map(),
  truncated: false,
  assetsShown: 0,
  fetchedAt: null,
};

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
): Promise<AssetsSnapshot> {
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null || signal.cancelled) return { ...EMPTY_SNAPSHOT, corporationId };

  const [assetsResult, divisionsResult, priceByTypeId] = await Promise.all([
    loadCorporationAssets(characterId, corporationId),
    loadCorporationDivisions(characterId, corporationId),
    loadAssetPrices(),
  ]);

  // A character switch mid-load: skip the label fan-out for a snapshot about
  // to be discarded rather than spending it on nothing.
  if (signal.cancelled) return { ...EMPTY_SNAPSHOT, corporationId };

  const assets = assetsResult.cached?.data ?? null;
  const inputs = assets === null ? null : toCorpAssetInputs(assets);
  const groups = inputs === null ? null : buildCorpAssetTree(inputs, priceByTypeId);
  const divisionNames = new Map(
    hangarDivisions(divisionsResult.cached?.data ?? null).map((d) => [d.division, d.name])
  );
  const labels =
    assets === null ? EMPTY_CORP_ASSET_LABELS : await loadCorpAssetLabels(characterId, assets);
  const truncated = assetsResult.cached?.truncated ?? false;
  const assetsShown = assets?.length ?? 0;

  const fetchedAts = [assetsResult, divisionsResult]
    .map((result) => result.cached?.fetchedAt)
    .filter((date): date is Date => date !== undefined);
  const fetchedAt =
    fetchedAts.length === 0
      ? null
      : fetchedAts.reduce((oldest, date) => (date < oldest ? date : oldest));

  return {
    corporationId,
    inputs,
    groups,
    divisionNames,
    labels,
    priceByTypeId,
    truncated,
    assetsShown,
    fetchedAt,
  };
}

/** `location_flag`s a personal asset list never sees, each with a fixed label. */
const FLAG_LABEL_KEY: Readonly<Record<Exclude<CorpAssetGroupId, number>, string>> = {
  officeFolder: 'corp.assets.flag.officeFolder',
  corpDeliveries: 'corp.assets.flag.corpDeliveries',
  impounded: 'corp.assets.flag.impounded',
  assetSafety: 'corp.assets.flag.assetSafety',
  other: 'corp.assets.flag.other',
};

type Translate = (key: string, opts?: Record<string, unknown>) => string;

function groupLabel(
  t: Translate,
  id: CorpAssetGroupId,
  divisionNames: ReadonlyMap<number, string | null>
): string {
  if (typeof id === 'number') {
    return divisionNames.get(id) ?? t('corp.vitals.division', { division: id });
  }
  return t(FLAG_LABEL_KEY[id]);
}

/** The resolved type name, else the raw id — every item-name lookup on this page goes through this one place so they cannot drift apart from each other. */
function typeDisplayName(typeId: number, typeNames: ReadonlyMap<number, string>): string {
  return typeNames.get(typeId) ?? `Type #${typeId}`;
}

function nodeLabel(
  node: AssetTreeNode,
  typeNames: ReadonlyMap<number, string>,
  t: Translate
): string {
  if (node.kind === 'bay') return t(`assets.bay.${node.bay}`);
  return typeDisplayName(node.asset.type_id, typeNames);
}

/** An asset stack's value at the global average price — 0 (not "unknown") for a type with no resolved price. */
function estimatedValueFor(
  asset: { type_id: number; quantity: number },
  priceByTypeId: ReadonlyMap<number, number>
): number {
  return asset.quantity * (priceByTypeId.get(asset.type_id) ?? 0);
}

interface CorpAssetMatch {
  node: Extract<AssetTreeNode, { kind: 'item' }>;
  name: string;
  /** Ancestor labels, outermost first: the division/flag-group label, then any container/ship names. */
  trail: string[];
  groupId: CorpAssetGroupId;
  /** Segments from the group root down to (not including) this item — where the search hit lives, for its link. */
  segments: string[];
}

/** Walks every group's tree once, collecting a name-matching leaf as a hit with its full ancestor trail — search leaves the drill-down and reports across every division at once. */
function searchCorpAssetGroups(
  groups: readonly AssetTreeGroup<CorpAssetGroupId>[],
  typeNames: ReadonlyMap<number, string>,
  divisionNames: ReadonlyMap<number, string | null>,
  t: Translate,
  query: string
): CorpAssetMatch[] {
  const q = query.trim().toLowerCase();
  const matches: CorpAssetMatch[] = [];

  function walk(
    groupId: CorpAssetGroupId,
    nodes: readonly AssetTreeNode[],
    trail: string[],
    segments: string[]
  ) {
    for (const node of nodes) {
      if (node.kind === 'item') {
        const name = typeDisplayName(node.asset.type_id, typeNames);
        if (!q || name.toLowerCase().includes(q))
          matches.push({ node, name, trail, groupId, segments });
        continue;
      }
      walk(
        groupId,
        node.children,
        [...trail, nodeLabel(node, typeNames, t)],
        [...segments, assetNodeSegment(node)]
      );
    }
  }

  for (const group of groups)
    walk(group.id, group.children, [groupLabel(t, group.id, divisionNames)], []);
  return matches;
}

type BrowseRow =
  | { kind: 'group'; key: string; group: AssetTreeGroup<CorpAssetGroupId> }
  | { kind: 'node'; key: string; node: AssetTreeNode }
  | { kind: 'match'; key: string; match: CorpAssetMatch };

function estimateRowHeight(row: BrowseRow): number {
  switch (row.kind) {
    case 'group':
    case 'match':
      return 64;
    case 'node':
      return 48;
  }
}

/** Mounted only once Corp Access is `ready` — see the `/corp` loader note. */
function CorpAssetsView() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const snapshot = useRouteSnapshot<AssetsSnapshot>(loadAssetsSnapshot, undefined, {
    // Keeps the asset list on screen during a manual refresh (issue #418).
    staleWhileRevalidate: true,
    cacheKey: 'corp-assets',
  });
  const data = snapshot.data;

  const wildcard = useParams()['*'] ?? '';
  const { groupId: pathGroupId, segments: pathSegments } = useMemo(
    () => parseCorpAssetPath(wildcard),
    [wildcard]
  );

  const groups = data?.groups ?? null;
  const typeNames = data?.labels.types ?? EMPTY_CORP_ASSET_LABELS.types;
  const divisionNames = data?.divisionNames ?? EMPTY_DIVISION_NAMES;

  const resolved = useMemo(
    () => resolveCorpAssetPath(groups ?? [], pathGroupId, pathSegments),
    [groups, pathGroupId, pathSegments]
  );

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [search]);
  const searchActive = debouncedSearch.trim().length > 0;

  const searchMatches = useMemo(
    () =>
      searchActive && groups
        ? searchCorpAssetGroups(groups, typeNames, divisionNames, t, debouncedSearch)
        : [],
    [searchActive, groups, typeNames, divisionNames, t, debouncedSearch]
  );

  const rows = useMemo<BrowseRow[]>(() => {
    if (searchActive) {
      return searchMatches.map((match) => ({
        kind: 'match' as const,
        key: `m:${match.node.asset.item_id}`,
        match,
      }));
    }
    if (pathGroupId !== null) {
      return resolved.children.map((node) => ({
        kind: 'node' as const,
        key: assetNodeSegment(node),
        node,
      }));
    }
    return (groups ?? []).map((group) => ({
      kind: 'group' as const,
      key: `g:${group.id}`,
      group,
    }));
  }, [searchActive, searchMatches, pathGroupId, resolved.children, groups]);

  const scrollParentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => estimateRowHeight(rows[index]),
    getItemKey: (index) => rows[index].key,
    overscan: 10,
  });
  useEffect(() => {
    if (scrollParentRef.current) scrollParentRef.current.scrollTop = 0;
  }, [wildcard, searchActive]);

  // Multi-select + bulk actions (same shape as /assets' issue #90).
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelectedIds(new Set());
      return !prev;
    });
  }, []);
  const toggleNodeSelection = useCallback((ids: readonly number[]) => {
    setSelectedIds((prev) => toggleSelection(prev, ids));
  }, []);

  const assetsByItemId = useMemo(
    () =>
      new Map(
        (data?.inputs ?? []).map((a) => [a.itemId, { type_id: a.typeId, quantity: a.quantity }])
      ),
    [data?.inputs]
  );

  const quickbar = useQuickbar(snapshot.activeCharacterId);
  const [infoModalItem, setInfoModalItem] = useState<{ typeId: number; itemName: string } | null>(
    null
  );
  const onShowInfo = useCallback((typeId: number, itemName: string) => {
    setInfoModalItem({ typeId, itemName });
  }, []);

  function collectRowItemIds(): number[] {
    return rows.flatMap((row) => {
      switch (row.kind) {
        case 'match':
          return [row.match.node.asset.item_id];
        case 'node':
          return collectItemIds(row.node);
        case 'group':
          return collectGroupItemIds(row.group);
      }
    });
  }
  function handleSelectAllInView() {
    setSelectedIds((prev) => selectAll(prev, collectRowItemIds()));
  }
  function handleDeselectAll() {
    setSelectedIds(new Set());
  }
  function handleBulkAddToQuickbar() {
    for (const id of selectedIds) {
      const asset = assetsByItemId.get(id);
      if (!asset) continue;
      quickbar.add(asset.type_id, typeDisplayName(asset.type_id, typeNames));
    }
  }
  function handleBulkAddToCompare() {
    const addToCompare = useCompareSet.getState().add;
    for (const id of selectedIds) {
      const asset = assetsByItemId.get(id);
      if (!asset) continue;
      addToCompare({
        typeId: asset.type_id,
        itemName: typeDisplayName(asset.type_id, typeNames),
      });
    }
  }
  function handleBulkCopyNames() {
    const names = namesForSelection([...selectedIds], assetsByItemId, typeNames);
    void writeToClipboard(names.join('\n'));
  }

  function handleExportCsv() {
    if (!groups) return;
    downloadCsv(
      'corp-assets',
      assetCsvRows(
        groups.map((group) => ({
          label: groupLabel(t, group.id, divisionNames),
          entries: collectGroupItemIds(group).map((itemId) => {
            const asset = assetsByItemId.get(itemId);
            // asset is always found here — assetsByItemId and the tree both
            // come from the same snapshot's asset list — but the id, not a
            // type id, is the only thing left to fall back to if that
            // invariant is ever wrong, so it gets its own distinct shape.
            return {
              name: asset ? typeDisplayName(asset.type_id, typeNames) : `#${itemId}`,
              quantity: asset?.quantity ?? 0,
            };
          }),
        }))
      ),
      assetsCsvColumns(t),
      new Date(),
      data?.truncated ?? false,
      'corp'
    );
  }

  const hasAnyAssets = (groups ?? []).some((group) => group.children.length > 0);

  if (!snapshot.hydrated) return <Spinner />;

  const parentHref =
    resolved.trail.length > 0
      ? corpAssetPathHref(pathGroupId, resolved.trail.slice(0, -1).map(assetNodeSegment))
      : corpAssetPathHref(null, []);
  const currentLabel =
    resolved.trail.length > 0
      ? nodeLabel(resolved.trail[resolved.trail.length - 1], typeNames, t)
      : resolved.group
        ? groupLabel(t, resolved.group.id, divisionNames)
        : '';

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('corp.assets.title')}
        meta={
          data?.fetchedAt ? (
            <DataAgeBadge date={data.fetchedAt} note={t('corp.dataAgeNote')} />
          ) : undefined
        }
        actions={
          <div className="ml-auto flex items-center gap-1.5">
            <IconButton
              icon={<Icon.Select />}
              label={t('assets.select.toggle')}
              pressed={selectMode}
              onClick={toggleSelectMode}
            />
            <IconButton
              icon={<Icon.Download />}
              label={t('assets.exportCsv')}
              disabled={!groups || !hasAnyAssets}
              onClick={handleExportCsv}
            />
            <IconButton
              icon={<Icon.Refresh />}
              label={t('corp.assets.refresh')}
              onClick={snapshot.refresh}
              disabled={snapshot.loading}
            />
          </div>
        }
      />
      <CorpSubNav />

      {snapshot.loading && data === null ? (
        <Spinner />
      ) : data === null || data.groups === null ? (
        <EmptyState
          title={t('corp.assets.loadFailedTitle')}
          hint={t('corp.assets.loadFailedHint')}
        />
      ) : !hasAnyAssets ? (
        <EmptyState title={t('corp.assets.empty')} hint={t('corp.assets.emptyHint')} />
      ) : (
        <div className="space-y-2">
          {data.truncated && (
            <p className="text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')} —{' '}
              {t('corp.assets.fetchTruncatedNotice', { shown: data.assetsShown })}
            </p>
          )}
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('corp.assets.searchPlaceholder')}
          />

          {selectMode && (
            <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 px-3 py-2">
              {selectedIds.size > 0 && (
                <span className="text-[0.6875rem] text-text-dim tabular-nums">
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
                    disabled={!quickbar.available}
                    onClick={handleBulkAddToQuickbar}
                  >
                    {t('assets.select.addToQuickbar')}
                  </Button>
                  <Button size="sm" onClick={handleBulkAddToCompare}>
                    {t('assets.select.addToCompare')}
                  </Button>
                  <Button size="sm" onClick={handleBulkCopyNames}>
                    {t('assets.select.copyNames')}
                  </Button>
                </>
              )}
            </div>
          )}

          <Panel padded={false} className="flex min-h-0 flex-col">
            {!searchActive && pathGroupId !== null && (
              <div className="flex shrink-0 items-center gap-2 border-b border-line bg-panel-2 py-1.5 pr-3 pl-1">
                <IconButton
                  icon={<Icon.Back size={Icon.ICON_SIZE.lg} />}
                  label={t('assets.breadcrumb.back')}
                  variant="plain"
                  onClick={() => void navigate(parentHref)}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {currentLabel}
                </span>
              </div>
            )}
            {searchActive && (
              <div className="flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel-2 px-3">
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
            )}

            {resolved.unresolved.length > 0 ? (
              <EmptyState
                title={t('assets.staleLink.title')}
                hint={t('assets.staleLink.hint')}
                className="py-8"
                action={
                  <Button size="sm" onClick={() => void navigate(corpAssetPathHref(null, []))}>
                    {t('assets.staleLink.action')}
                  </Button>
                }
              />
            ) : rows.length === 0 ? (
              <EmptyState
                title={searchActive ? t('assets.noResults') : t('corp.assets.divisionEmpty')}
                className="py-8"
              />
            ) : (
              <div
                ref={scrollParentRef}
                data-virtual-scroll-root
                className="min-h-0 overflow-y-auto"
              >
                <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
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
                          typeNames={typeNames}
                          divisionNames={divisionNames}
                          selectMode={selectMode}
                          selectedIds={selectedIds}
                          onToggleSelection={toggleNodeSelection}
                          onAddToQuickbar={quickbar.add}
                          quickbarAvailable={quickbar.available}
                          onShowInfo={onShowInfo}
                          pathGroupId={pathGroupId}
                          pathSegments={pathSegments}
                          priceByTypeId={data?.priceByTypeId ?? EMPTY_PRICES}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Panel>
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
  divisionNames: ReadonlyMap<number, string | null>;
  selectMode: boolean;
  selectedIds: ReadonlySet<number>;
  onToggleSelection: (ids: readonly number[]) => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
  pathGroupId: CorpAssetGroupId | null;
  pathSegments: readonly string[];
  priceByTypeId: ReadonlyMap<number, number>;
}

/** Dispatches one virtualized row to the right presentation component. */
function BrowseRowView(props: BrowseRowViewProps) {
  const { row, t } = props;

  if (row.kind === 'group') {
    const { group } = row;
    return (
      <LocationRow
        href={corpAssetPathHref(group.id, [])}
        label={groupLabel(t, group.id, props.divisionNames)}
        security={undefined}
        jumpsAway={undefined}
        itemCount={group.itemCount}
        estimatedValue={group.estimatedValue}
        pinState="unpinned"
        onTogglePin={() => {}}
        showPin={false}
        selectMode={props.selectMode}
        selectionState={selectionStateForIds(collectGroupItemIds(group), props.selectedIds)}
        onToggleSelection={() => props.onToggleSelection(collectGroupItemIds(group))}
        t={t}
      />
    );
  }

  if (row.kind === 'node') {
    return <NodeRowView {...props} node={row.node} />;
  }

  const { match } = row;
  return (
    <SearchResultRow
      name={match.name}
      quantity={match.node.asset.quantity}
      estimatedValue={estimatedValueFor(match.node.asset, props.priceByTypeId)}
      trail={match.trail}
      security={undefined}
      href={corpAssetPathHref(match.groupId, match.segments)}
      characterBadge={null}
      t={t}
    />
  );
}

function NodeRowView({
  node,
  t,
  typeNames,
  selectMode,
  selectedIds,
  onToggleSelection,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
  pathGroupId,
  pathSegments,
  priceByTypeId,
}: BrowseRowViewProps & { node: AssetTreeNode }) {
  const label = nodeLabel(node, typeNames, t);

  if (node.kind !== 'item') {
    return (
      <ContainerRow
        href={corpAssetPathHref(pathGroupId, [...pathSegments, assetNodeSegment(node)])}
        label={label}
        itemCount={node.itemCount}
        estimatedValue={node.estimatedValue}
        characterBadge={null}
        named={node.kind !== 'bay'}
        selectMode={selectMode}
        selectionState={selectionStateForIds(collectItemIds(node), selectedIds)}
        onToggleSelection={() => onToggleSelection(collectItemIds(node))}
        t={t}
      />
    );
  }

  const { asset } = node;
  return (
    <ItemRow
      name={label}
      quantity={asset.quantity}
      unitVolume={undefined}
      estimatedValue={estimatedValueFor(asset, priceByTypeId)}
      characterBadge={null}
      selectMode={selectMode}
      selectionState={selectedIds.has(asset.item_id) ? 'checked' : 'unchecked'}
      onToggleSelection={() => onToggleSelection([asset.item_id])}
      t={t}
      wrap={(children) => (
        <ItemContextMenu
          typeId={asset.type_id}
          itemName={label}
          blueprintTypeID={null}
          onAddToQuickbar={onAddToQuickbar}
          quickbarAvailable={quickbarAvailable}
          onShowInfo={onShowInfo}
        >
          {children}
        </ItemContextMenu>
      )}
    />
  );
}

export function CorpAssets() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canReadAssets);

  if (gate.status === 'loading') return <Spinner />;

  if (gate.status === 'denied') {
    return (
      <div className="space-y-4">
        <PageHeader title={t('corp.assets.title')} />
        <EmptyState title={t('corp.assets.noAccessTitle')} hint={t('corp.assets.noAccessHint')} />
      </div>
    );
  }

  return <CorpAssetsView />;
}
