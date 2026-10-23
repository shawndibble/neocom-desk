/**
 * `/corp/assets` — the corporation's inventory ledger (issue #4671): every
 * item the corporation owns, classified the way the in-game Corporation Assets
 * window does (Offices, Corp deliveries, In space, Impounded, Asset safety,
 * Lockdown, Capsuleer deliveries) and read either by item (with stock targets
 * and the shortfall against them) or by location (office › division).
 * `docs/context/decisions/` records why this replaced the division-first tree.
 *
 * URL (ADR 0015): the tab is the path (`/corp/assets/impounded`, the bare path
 * is All; `features/corp/corpAssetsTabs.ts`) and the view state is the query —
 * `q` search, `group=location` (absent: by item), `loc` a station/structure
 * id, `div` a hangar division 1–7, `cat` a top-level market group id (the
 * Category filter and Group column), `below=1` the Below target filter. The
 * Corp overview's Corp assets widget links to these. An unknown path under
 * `/corp/assets/*`, such as an old tree deep link, redirects to `/corp/assets`
 * keeping the query.
 *
 * **Director-only, and the whole page rather than a panel**, for the same
 * reason `/corp/members` is: `canReadAssets` (`engine/corpRoles.ts`) answers
 * to `Director` alone, so anyone else following an Assets tab would land on
 * an explanation instead of a ledger. The `unknown`/`ready` split and the
 * mount-on-`ready` reasoning live in `useCorpRouteGate`.
 *
 * Blueprint/build plan linking stays explicitly disabled
 * (`blueprintTypeID={null}`): corp assets never loads the blueprint catalog.
 */
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CachedNotice,
  DataAgeBadge,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterField,
  IconButton,
  LiveStatus,
  PageHeader,
  Panel,
  SearchInput,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  TabPanel,
  Tabs,
  useTabsId,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { CorpRolesGate } from '@/features/corp/CorpRolesGate';
import { CorpDenied } from '@/features/corp/CorpDenied';
import { loadCorporationId } from '@/features/corp/boardData';
import {
  EMPTY_CORP_ASSET_LABELS,
  assetPlaceIds,
  loadCorporationAssets,
  loadCorpAssetLabels,
  resolveMissingLocationNames,
  toCorpAssetInputs,
  type CorpAssetLabels,
} from '@/features/corp/assets';
import { loadCorporationDivisions } from '@/features/corp/wallet';
import { hangarDivisions } from '@/features/corp/divisions';
import { HANGAR_DIVISIONS, type CorpAssetInput } from '@/engine/corp/assetDivisions';
import {
  buildItemLedger,
  buildLocationLedger,
  classifyCorpAssets,
  countLedgerByState,
  evaluateStockTargets,
  type ClassifiedAsset,
  type ItemLedgerRow,
} from '@/engine/corp/assetLedger';
import {
  CORP_ASSET_TABS,
  corpAssetTabFromPath,
  corpAssetTabPath,
  tabForState,
  type CorpAssetTab,
} from '@/features/corp/corpAssetsTabs';
import { loadTypeCategories, type AssetCategory } from '@/features/corp/assetCategories';
import {
  buildLocationRows,
  filterClassified,
  makeLedgerLabels,
  officeUsage,
  type LocationRow,
} from '@/features/corp/assetLedgerView';
import { CorpAssetItemTable, type ItemTableRow } from '@/features/corp/CorpAssetItemTable';
import { CorpAssetLocationTable } from '@/features/corp/CorpAssetLocationTable';
import { useCorpStockTargets } from '@/features/corp/stockTargets';
import { useTargetTypeInfo } from '@/features/corp/useTargetTypeInfo';
import { StockTargetsDialog } from '@/features/corp/StockTargetsDialog';
import { loadTypeVolumes } from '@/features/character/typeNames';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { addQuickbarItem } from '@/features/market/quickbar';
import { useMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { useBlueprintTypeIds } from '@/features/character/useBlueprintTypeIds';
import { useCompareSet } from '@/features/market/compareSet';
import { writeToClipboard } from '@/lib/clipboard';
import { getAveragePriceByType } from '@/market/prices';
import { loadCorporationBlueprints } from '@/features/corp/blueprints';
import { loadAssetCopyValues } from '@/features/assets/assetCopyValues';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useUrlParams } from '@/lib/useUrlState';
import { boolParam, enumParam, optionalIntParam, textParam } from '@/lib/urlState';

const URL_PARAMS = {
  q: textParam(),
  group: enumParam(['item', 'location'] as const, 'item'),
  loc: optionalIntParam({ min: 1 }),
  div: optionalIntParam({ min: 1, max: 7 }),
  cat: optionalIntParam({ min: 1 }),
  below: boolParam(),
};

const EMPTY_PRICES: ReadonlyMap<number, number> = new Map();
const EMPTY_DIVISION_NAMES: ReadonlyMap<number, string | null> = new Map();
const EMPTY_CATEGORIES: ReadonlyMap<number, AssetCategory> = new Map();
const ALL = 'all';
const EMPTY_KEYS: ReadonlySet<string> = new Set();

const TAB_LABEL_KEY: Readonly<Record<CorpAssetTab, string>> = {
  all: 'corp.assets.tab.all',
  offices: 'corp.assets.tab.offices',
  deliveries: 'corp.assets.tab.deliveries',
  inSpace: 'corp.assets.tab.inSpace',
  impounded: 'corp.assets.tab.impounded',
  assetSafety: 'corp.assets.tab.assetSafety',
  lockdown: 'corp.assets.tab.lockdown',
  capsuleerDeliveries: 'corp.assets.tab.capsuleerDeliveries',
};

interface AssetsSnapshot {
  corporationId: number | null;
  /**
   * `null` means the assets read itself did not come back — offline,
   * uncached, or a 403 the role gate swallowed — and is distinct from a
   * corporation that was read successfully and genuinely owns nothing.
   */
  inputs: CorpAssetInput[] | null;
  /** Division number -> the corp's own name for it, or null if unnamed/unresolved. */
  divisionNames: ReadonlyMap<number, string | null>;
  /** Type names, and the location names already on the device. The rest arrive after first paint (`resolveMissingLocationNames`). */
  labels: CorpAssetLabels;
  /** Every station/structure the assets sit in, named or not. */
  placeIds: readonly number[];
  /** Global average market price per type, best-effort — an outage degrades ISK figures to 0 rather than the whole page. */
  priceByTypeId: ReadonlyMap<number, number>;
  /** Each blueprint copy's own value by item id (`engine/blueprintCopyValue.ts`) — a copy never takes its type's average price. */
  copyValueByItemId: ReadonlyMap<number, number>;
  /** Physical volume (m3, unpackaged) per type, best-effort from the slim SDE snapshot. */
  volumeByTypeId: ReadonlyMap<number, number>;
  /** Top-level market group per type, best-effort from the market catalogue. */
  categoryByTypeId: ReadonlyMap<number, AssetCategory>;
  /** The page cap was hit or a page was missing — corp holdings are the likelier of the two lists to hit it. */
  truncated: boolean;
  assetsShown: number;
  /** Oldest `fetchedAt` across the reads — the badge speaks for the whole view. */
  fetchedAt: Date | null;
  /** Either read fell back to its saved copy. */
  fromCache: boolean;
}

const EMPTY_SNAPSHOT: AssetsSnapshot = {
  corporationId: null,
  inputs: null,
  divisionNames: new Map(),
  labels: EMPTY_CORP_ASSET_LABELS,
  placeIds: [],
  priceByTypeId: new Map(),
  copyValueByItemId: new Map(),
  volumeByTypeId: new Map(),
  categoryByTypeId: new Map(),
  truncated: false,
  assetsShown: 0,
  fetchedAt: null,
  fromCache: false,
};

async function loadAssetsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal,
  canReadBlueprints: boolean
): Promise<AssetsSnapshot> {
  const corporationId = await loadCorporationId(characterId);
  if (corporationId === null || signal.cancelled) return { ...EMPTY_SNAPSHOT, corporationId };

  const [assetsResult, divisionsResult, priceByTypeId] = await Promise.all([
    loadCorporationAssets(characterId, corporationId),
    loadCorporationDivisions(characterId, corporationId),
    getAveragePriceByType(),
  ]);

  // A character switch mid-load: skip the label fan-out for a snapshot about
  // to be discarded rather than spending it on nothing.
  if (signal.cancelled) return { ...EMPTY_SNAPSHOT, corporationId };

  const assets = assetsResult.cached?.data ?? null;
  const inputs = assets === null ? null : toCorpAssetInputs(assets);
  const typeIds = inputs === null ? [] : [...new Set(inputs.map((i) => i.typeId))];
  const placeIds = assets === null ? [] : assetPlaceIds(assets);
  const [labels, volumeByTypeId, categoryByTypeId, copyValueByItemId] = await Promise.all([
    assets === null ? EMPTY_CORP_ASSET_LABELS : loadCorpAssetLabels(assets, placeIds),
    loadTypeVolumes(typeIds),
    loadTypeCategories(typeIds),
    // Director-only endpoint: without the role a copy still prices, at ME0/TE0.
    loadAssetCopyValues(characterId, assets ?? [], async () =>
      canReadBlueprints
        ? ((await loadCorporationBlueprints(characterId, corporationId)).cached?.data ?? null)
        : null
    ),
  ]);
  const divisionNames = new Map(
    hangarDivisions(divisionsResult.cached?.data ?? null).map((d) => [d.division, d.name])
  );

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
    divisionNames,
    labels,
    placeIds,
    priceByTypeId,
    copyValueByItemId,
    volumeByTypeId,
    categoryByTypeId,
    truncated: assetsResult.cached?.truncated ?? false,
    assetsShown: assets?.length ?? 0,
    fetchedAt,
    fromCache: [assetsResult, divisionsResult].some((result) => result.cached?.fromCache),
  };
}

const rowKeyOf = (row: ItemLedgerRow) => `${row.typeId}:${row.isBlueprintCopy ? 'c' : 'o'}`;

/** The by-item filters' draft: the three the funnel holds (search, group-by and Below target sit outside it). */
interface PlaceFilter {
  loc: number | null;
  div: number | null;
  cat: number | null;
}

/** Mounted only once Corp Access is `ready` — see the `/corp` loader note. */
function CorpAssetsView({
  tab,
  canReadBlueprints,
}: {
  tab: CorpAssetTab;
  canReadBlueprints: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const tabsId = useTabsId();
  // `useRouteSnapshot` keys its reload on the Character and refresh only, so
  // this loader must not close over changing state: the parent remounts this
  // view (`key`) when `canReadBlueprints` flips instead.
  const loadSnapshot = useCallback(
    (characterId: number, signal: RouteSnapshotSignal) =>
      loadAssetsSnapshot(characterId, signal, canReadBlueprints),
    [canReadBlueprints]
  );
  const snapshot = useRouteSnapshot<AssetsSnapshot>(loadSnapshot, undefined, {
    // Keeps the asset list on screen during a manual refresh (issue #418).
    staleWhileRevalidate: true,
    cacheKey: 'corp-assets',
  });
  const data = snapshot.data;

  const [params, setParams] = useUrlParams(URL_PARAMS);
  const [debouncedQuery] = useDebouncedValue(params.q);
  const query = debouncedQuery.trim().toLowerCase();
  const byLocation = params.group === 'location';

  const targetsApi = useCorpStockTargets(data?.corporationId ?? null);
  // A targeted type the corporation owns none of is in no asset read: resolve it separately.
  const unnamedTargetIds = useMemo(
    () => [...targetsApi.targets.keys()].filter((id) => !data?.labels.types.has(id)),
    [targetsApi.targets, data?.labels.types]
  );
  const targetInfo = useTargetTypeInfo(unnamedTargetIds);

  const typeNames = useMemo(
    () =>
      targetInfo.names.size === 0
        ? (data?.labels.types ?? EMPTY_CORP_ASSET_LABELS.types)
        : new Map([...targetInfo.names, ...(data?.labels.types ?? [])]),
    [data?.labels.types, targetInfo.names]
  );
  // The ledger paints with the names the device already has; the rest are
  // looked up here, after first paint, and fill in as they land.
  const missingPlaceIds = useMemo(
    () => (data ? data.placeIds.filter((id) => !data.labels.locations.has(id)) : []),
    [data]
  );
  const activeCharacterId = snapshot.activeCharacterId;
  const loadMissingPlaces = useCallback(
    () => resolveMissingLocationNames(activeCharacterId as number, missingPlaceIds),
    [activeCharacterId, missingPlaceIds]
  );
  const missingPlaces = useKeyedLoad(
    missingPlaceIds.length > 0 && activeCharacterId !== null
      ? `${activeCharacterId}:${data?.corporationId}`
      : null,
    loadMissingPlaces
  );
  const locationNames = useMemo(
    () =>
      missingPlaces.data && missingPlaces.data.size > 0
        ? new Map([...(data?.labels.locations ?? []), ...missingPlaces.data])
        : (data?.labels.locations ?? EMPTY_CORP_ASSET_LABELS.locations),
    [data?.labels.locations, missingPlaces.data]
  );
  const divisionNames = data?.divisionNames ?? EMPTY_DIVISION_NAMES;
  const categoryByTypeId = useMemo(
    () =>
      targetInfo.categories.size === 0
        ? (data?.categoryByTypeId ?? EMPTY_CATEGORIES)
        : new Map([...targetInfo.categories, ...(data?.categoryByTypeId ?? [])]),
    [data?.categoryByTypeId, targetInfo.categories]
  );
  const blueprintTypeIds = useBlueprintTypeIds(typeNames);
  const labels = useMemo(
    () => makeLedgerLabels({ t, typeNames, locationNames, divisionNames }),
    [t, typeNames, locationNames, divisionNames]
  );

  const classified = useMemo(() => classifyCorpAssets(data?.inputs ?? []), [data?.inputs]);
  const counts = useMemo(() => countLedgerByState(classified.items), [classified.items]);

  const stock = useMemo(
    () => evaluateStockTargets(targetsApi.targets, classified.items),
    [targetsApi.targets, classified.items]
  );
  const shortTypeIds = useMemo(
    () => new Set([...stock].filter(([, s]) => s.status !== 'met').map(([typeId]) => typeId)),
    [stock]
  );
  const ownedByTypeId = useMemo(
    () => new Map([...stock].map(([typeId, s]) => [typeId, s.owned])),
    [stock]
  );
  const [targetsOpen, setTargetsOpen] = useState(false);

  const valuation = useMemo(
    () => ({
      prices: data?.priceByTypeId ?? EMPTY_PRICES,
      copyValues: data?.copyValueByItemId ?? EMPTY_PRICES,
      volumes: data?.volumeByTypeId ?? EMPTY_PRICES,
    }),
    [data?.priceByTypeId, data?.copyValueByItemId, data?.volumeByTypeId]
  );

  const itemRows = useMemo<ItemTableRow[]>(() => {
    if (byLocation) return [];
    const ledger = buildItemLedger(classified.items, {
      ...valuation,
      filter: {
        state: tab,
        locationId: params.loc ?? undefined,
        division: (params.div ?? undefined) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | undefined,
      },
      targets: targetsApi.targets,
      stock,
    });
    return ledger
      .filter((row) => {
        if (params.below && !shortTypeIds.has(row.typeId)) return false;
        if (params.below && row.isBlueprintCopy) return false;
        if (params.cat !== null && categoryByTypeId.get(row.typeId)?.id !== params.cat) {
          return false;
        }
        return query === '' || labels.typeName(row.typeId).toLowerCase().includes(query);
      })
      .map((row) => ({
        key: rowKeyOf(row),
        ledger: row,
        name: labels.typeName(row.typeId),
        categoryName: categoryByTypeId.get(row.typeId)?.name ?? null,
      }));
  }, [
    byLocation,
    classified.items,
    valuation,
    tab,
    params.loc,
    params.div,
    params.below,
    params.cat,
    targetsApi.targets,
    stock,
    shortTypeIds,
    categoryByTypeId,
    query,
    labels,
  ]);

  // Which offices are empty is a fact about the corporation, not about the current search.
  const officeUsageWhole = useMemo(
    () => (byLocation ? officeUsage(buildLocationLedger(classified, valuation)) : new Map()),
    [byLocation, classified, valuation]
  );

  const locationRows = useMemo<LocationRow[]>(() => {
    if (!byLocation) return [];
    const items: ClassifiedAsset[] = filterClassified(classified.items, {
      query,
      categoryId: params.cat,
      categoryOf: (typeId) => categoryByTypeId.get(typeId)?.id ?? null,
      onlyTypeIds: params.below ? shortTypeIds : null,
      typeName: labels.typeName,
    });
    const ledger = buildLocationLedger({ ...classified, items }, valuation);
    return buildLocationRows(ledger, {
      usage: officeUsageWhole,
      filtered:
        query !== '' ||
        params.cat !== null ||
        params.below ||
        params.loc !== null ||
        params.div !== null,
      tab,
      locationId: params.loc,
      division: (params.div ?? null) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | null,
      labels,
    });
  }, [
    byLocation,
    classified,
    valuation,
    tab,
    params.loc,
    params.div,
    params.below,
    params.cat,
    shortTypeIds,
    categoryByTypeId,
    query,
    labels,
    officeUsageWhole,
  ]);

  // Filter options come from the whole corporation, not the current narrowing.
  const locationOptions = useMemo(() => {
    const ids = new Set<number>(classified.officeLocationIds);
    for (const item of classified.items) {
      if (item.locationId !== null) ids.add(item.locationId);
    }
    return [...ids]
      .map((id) => ({ id, label: labels.placeName(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [classified, labels]);
  const categoryOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const item of classified.items) {
      const category = categoryByTypeId.get(item.input.typeId);
      if (category) seen.set(category.id, category.name);
    }
    return [...seen]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [classified.items, categoryByTypeId]);

  // Multi-select + bulk actions (same shape as /assets' issue #90), by item only.
  const [selectMode, setSelectMode] = useState(false);
  // A selection belongs to the view it was made in: a tab, filter, search or group change drops it.
  const selectionScope = [
    tab,
    params.loc,
    params.div,
    params.cat,
    params.below,
    params.group,
    query,
  ].join('|');
  const [selection, setSelection] = useState<{ scope: string; keys: ReadonlySet<string> }>({
    scope: '',
    keys: new Set(),
  });
  const selectedKeys = selection.scope === selectionScope ? selection.keys : EMPTY_KEYS;
  const setSelectedKeys = useCallback(
    (update: (prev: ReadonlySet<string>) => ReadonlySet<string>) =>
      setSelection((prev) => ({
        scope: selectionScope,
        keys: update(prev.scope === selectionScope ? prev.keys : EMPTY_KEYS),
      })),
    [selectionScope]
  );
  const toggleSelectMode = useCallback(() => {
    setSelectMode((prev) => {
      if (prev) setSelection({ scope: '', keys: EMPTY_KEYS });
      return !prev;
    });
  }, []);
  const toggleKey = useCallback(
    (key: string) => {
      setSelectedKeys((prev) => {
        const next = new Set(prev);
        if (!next.delete(key)) next.add(key);
        return next;
      });
    },
    [setSelectedKeys]
  );

  const itemActions = usePageItemActions({ activeCharacterId: snapshot.activeCharacterId });
  const isAbyssalType = useMutaplasmidLookup()?.isAbyssalType;
  // A type's original and its copy are two rows but one type.
  const selectedTypeIds = [...new Set([...selectedKeys].map((key) => Number(key.split(':')[0])))];

  function handleBulkAddToQuickbar() {
    // One write: `quickbar.add` closes over the rendered list, so looping it keeps only the last.
    let items = itemActions.quickbar.items;
    for (const typeId of selectedTypeIds) {
      // Abyssal: no market; the row menu skips Quickbar too.
      if (isAbyssalType?.(typeId)) continue;
      items = addQuickbarItem(items, { typeId, name: labels.typeName(typeId) });
    }
    void itemActions.quickbar.write(items);
  }
  function handleBulkAddToCompare() {
    const addToCompare = useCompareSet.getState().add;
    for (const typeId of selectedTypeIds) {
      addToCompare({ typeId, itemName: labels.typeName(typeId) });
    }
  }
  function handleBulkCopyNames() {
    void writeToClipboard(selectedTypeIds.map((typeId) => labels.typeName(typeId)).join('\n'));
  }

  const hasAnyAssets = (data?.inputs ?? []).length > 0;

  function selectTab(id: string) {
    void navigate({
      pathname: corpAssetTabPath(id as CorpAssetTab),
      search: location.search,
    });
  }

  /** A division, deliveries or place row opens the by-item view narrowed to it. */
  function openLocationRow(row: LocationRow) {
    const next = new URLSearchParams(location.search);
    next.delete('group');
    next.delete('lsort');
    if (row.locationId === null) next.delete('loc');
    else next.set('loc', String(row.locationId));
    if (row.division === null) next.delete('div');
    else next.set('div', String(row.division));
    const search = next.toString();
    void navigate({
      pathname: corpAssetTabPath(row.kind === 'division' ? tab : tabForState(row.state)),
      search: search === '' ? '' : `?${search}`,
    });
  }

  if (!snapshot.hydrated) return <Spinner />;

  const placeFilter: PlaceFilter = { loc: params.loc, div: params.div, cat: params.cat };
  const activeFilterCount = [params.loc, params.div, params.cat].filter((v) => v !== null).length;
  const shownCount = byLocation ? locationRows.length : itemRows.length;

  const tabs = CORP_ASSET_TABS.filter(
    (id) => id === 'all' || id === 'offices' || id === tab || counts[id] > 0
  ).map((id) => ({
    id,
    label: t(TAB_LABEL_KEY[id]),
    count: counts[id],
    ...(id === 'impounded' || id === 'assetSafety'
      ? { countTone: 'danger' as const }
      : id === 'deliveries'
        ? { countTone: 'warning' as const }
        : {}),
  }));

  const noMatches = (
    <EmptyState
      title={t('corp.assets.noMatchesTitle')}
      hint={t('corp.assets.noMatchesHint')}
      className="py-8"
    />
  );

  const renderToolbar = (columnPicker: ReactNode, exportMenu: ReactNode) => (
    <div className="space-y-2">
      <FilterBar<PlaceFilter>
        value={placeFilter}
        onChange={(next) => setParams({ loc: next.loc, div: next.div, cat: next.cat })}
        activeCount={activeFilterCount}
        title={t('corp.assets.filtersTitle')}
        search={
          <SearchInput
            value={params.q}
            onChange={(e) => setParams({ q: e.target.value })}
            placeholder={t('corp.assets.searchPlaceholder')}
            className="min-w-48 flex-1"
          />
        }
        actions={
          <>
            {columnPicker}
            {exportMenu}
          </>
        }
      >
        {(draft, setDraft) => (
          <>
            <FilterField label={t('corp.assets.filter.location')}>
              <Select
                value={draft.loc === null ? ALL : String(draft.loc)}
                onValueChange={(v) => setDraft({ ...draft, loc: v === ALL ? null : Number(v) })}
              >
                <SelectTrigger aria-label={t('corp.assets.filter.location')} className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('corp.assets.filter.anyLocation')}</SelectItem>
                  {locationOptions.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={t('corp.assets.filter.division')}>
              <Select
                value={draft.div === null ? ALL : String(draft.div)}
                onValueChange={(v) => setDraft({ ...draft, div: v === ALL ? null : Number(v) })}
              >
                <SelectTrigger aria-label={t('corp.assets.filter.division')} className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('corp.assets.filter.anyDivision')}</SelectItem>
                  {HANGAR_DIVISIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {labels.divisionName(d)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label={t('corp.assets.filter.category')}>
              <Select
                value={draft.cat === null ? ALL : String(draft.cat)}
                onValueChange={(v) => setDraft({ ...draft, cat: v === ALL ? null : Number(v) })}
              >
                <SelectTrigger aria-label={t('corp.assets.filter.category')} className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('corp.assets.filter.anyCategory')}</SelectItem>
                  {categoryOptions.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
          </>
        )}
      </FilterBar>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label={t('corp.assets.groupBy.label')}
          value={params.group}
          onChange={(group) => setParams({ group })}
          options={[
            { value: 'item', label: t('corp.assets.groupBy.item') },
            { value: 'location', label: t('corp.assets.groupBy.location') },
          ]}
          uppercase={false}
        />
        <FilterChip
          size="md"
          label={t('corp.assets.belowTarget')}
          selected={params.below}
          onToggle={() => setParams({ below: !params.below })}
          count={shortTypeIds.size}
          countLabel={t('corp.assets.belowTargetCount', { count: shortTypeIds.size })}
          disabled={targetsApi.targets.size === 0 && !params.below}
          tooltip={
            targetsApi.targets.size === 0 && !params.below
              ? t('corp.assets.belowTargetNone')
              : undefined
          }
        />
        <Button
          size="sm"
          className="ml-auto"
          disabled={!targetsApi.hydrated || data?.corporationId == null}
          onClick={() => setTargetsOpen(true)}
        >
          {t('corp.assets.stockTargetsButton')}
        </Button>
      </div>
    </div>
  );

  return (
    <ItemActionsProvider page={itemActions}>
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader
          title={t('corp.assets.title')}
          meta={
            data?.fetchedAt ? (
              <DataAgeBadge date={data.fetchedAt} note={t('corp.dataAgeNote')} />
            ) : undefined
          }
          actions={
            <div className="ml-auto flex items-center gap-1.5">
              {!byLocation && (
                <IconButton
                  icon={<Icon.Select />}
                  label={t('assets.select.toggle')}
                  pressed={selectMode}
                  onClick={toggleSelectMode}
                />
              )}
              <IconButton
                icon={<Icon.Refresh />}
                label={t('corp.assets.refresh')}
                onClick={snapshot.refresh}
                disabled={snapshot.loading}
              />
            </div>
          }
        />

        {snapshot.loading && data === null ? (
          <Spinner />
        ) : data === null || data.inputs === null ? (
          <EmptyState
            title={t('corp.assets.loadFailedTitle')}
            hint={t('corp.assets.loadFailedHint')}
          />
        ) : !hasAnyAssets ? (
          <EmptyState title={t('corp.assets.empty')} hint={t('corp.assets.emptyHint')} />
        ) : (
          <div className="space-y-2">
            {data.fromCache && (
              <CachedNotice fetchedAt={data.fetchedAt} refreshFailed={snapshot.refreshCount > 0} />
            )}
            {data.truncated && (
              <p className="text-[0.6875rem] text-warning uppercase">
                {t('common.incompleteTitle')} —{' '}
                {t('corp.assets.fetchTruncatedNotice', { shown: data.assetsShown })}
              </p>
            )}
            <LiveStatus>
              {selectMode && selectedKeys.size > 0
                ? t('assets.select.selectedCount', { count: selectedKeys.size })
                : query !== ''
                  ? t('assets.search.resultCount', { count: shownCount })
                  : null}
            </LiveStatus>
            <Tabs
              tabsId={tabsId}
              tabs={tabs}
              value={tab}
              onChange={selectTab}
              label={t('corp.assets.tabsLabel')}
              activation="manual"
            />
            <TabPanel tabsId={tabsId} tabId={tab} className="space-y-2">
              {selectMode && !byLocation && (
                <div className="flex flex-wrap items-center gap-2 rounded-xs border border-line bg-panel-2 px-3 py-2">
                  {selectedKeys.size > 0 && (
                    <span
                      aria-hidden="true"
                      className="text-[0.6875rem] text-text-dim tabular-nums"
                    >
                      {t('assets.select.selectedCount', { count: selectedKeys.size })}
                    </span>
                  )}
                  <Button
                    size="sm"
                    onClick={() =>
                      setSelectedKeys((prev) => new Set([...prev, ...itemRows.map((r) => r.key)]))
                    }
                  >
                    {t('assets.select.selectAllInView')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={selectedKeys.size === 0}
                    onClick={() => setSelectedKeys(() => EMPTY_KEYS)}
                  >
                    {t('assets.select.deselectAll')}
                  </Button>
                  {selectedKeys.size > 0 && (
                    <>
                      <Button
                        size="sm"
                        disabled={!itemActions.quickbar.available}
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
                {byLocation ? (
                  <CorpAssetLocationTable
                    rows={locationRows}
                    labels={labels}
                    onOpenRow={openLocationRow}
                    renderToolbar={(picker, exportMenu) => (
                      <div className="border-b border-line p-3">
                        {renderToolbar(picker, exportMenu)}
                      </div>
                    )}
                    truncated={data.truncated}
                    emptyState={noMatches}
                  />
                ) : (
                  <CorpAssetItemTable
                    rows={itemRows}
                    labels={labels}
                    below={params.below}
                    blueprintTypeIds={blueprintTypeIds}
                    selectMode={selectMode}
                    selectedKeys={selectedKeys}
                    onToggleKey={toggleKey}
                    canEditTargets={targetsApi.hydrated && data.corporationId !== null}
                    onSetTarget={targetsApi.setTarget}
                    onRemoveTarget={targetsApi.removeTarget}
                    renderToolbar={(picker, exportMenu) => (
                      <div className="border-b border-line p-3">
                        {renderToolbar(picker, exportMenu)}
                      </div>
                    )}
                    truncated={data.truncated}
                    emptyState={noMatches}
                  />
                )}
              </Panel>
            </TabPanel>
          </div>
        )}
        <StockTargetsDialog
          corporationId={data?.corporationId ?? null}
          open={targetsOpen}
          onOpenChange={setTargetsOpen}
          ownedByTypeId={ownedByTypeId}
        />
      </div>
    </ItemActionsProvider>
  );
}

/** Reads the tab off the path; an unknown path (an old tree link) goes to `/corp/assets`, keeping the query. */
function CorpAssetsRoute({ canReadBlueprints }: { canReadBlueprints: boolean }) {
  const wildcard = useParams()['*'] ?? '';
  const { search } = useLocation();
  const tab = corpAssetTabFromPath(wildcard);
  if (tab === null) return <Navigate replace to={{ pathname: '/corp/assets', search }} />;
  return <CorpAssetsView tab={tab} canReadBlueprints={canReadBlueprints} />;
}

export function CorpAssets() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canReadAssets);

  const content =
    gate.status === 'denied' ? (
      <div className="mx-auto max-w-6xl space-y-4">
        <PageHeader title={t('corp.assets.title')} />
        <CorpDenied
          reason={gate.reason}
          title={t('corp.assets.noAccessTitle')}
          hint={t('corp.assets.noAccessHint')}
        />
      </div>
    ) : gate.status === 'ready' ? (
      <CorpAssetsRoute
        key={String(gate.capabilities.canReadBlueprints)}
        canReadBlueprints={gate.capabilities.canReadBlueprints}
      />
    ) : null;

  return <CorpRolesGate gate={gate}>{content}</CorpRolesGate>;
}
