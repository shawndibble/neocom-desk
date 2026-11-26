import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  CachedNotice,
  DataAgeBadge,
  EmptyState,
  LoadFailedState,
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
  IncompleteNotice,
  Tooltip,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useCorpRouteGate } from '@/features/corp/useCorpRouteGate';
import { CorpRolesGate } from '@/features/corp/CorpRolesGate';
import { CorpDenied } from '@/features/corp/CorpDenied';
import { EMPTY_CORP_ASSET_LABELS, resolveMissingLocationNames } from '@/features/corp/assets';
import { HANGAR_DIVISIONS } from '@/engine/corp/assetDivisions';
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
  corpAssetsPageTabFromPath,
  corpAssetsPageTabPath,
  corpAssetTabPath,
  tabForState,
  type CorpAssetsPageTab,
  type CorpAssetTab,
} from '@/features/corp/corpAssetsTabs';
import {
  loadCorpAssetsSnapshot,
  type CorpAssetsSnapshot,
} from '@/features/assets/corpAssetsSnapshot';
import { activePlaceFilters, type PlaceFilter } from '@/features/corp/activePlaceFilters';
import { MovePlanTab } from '@/features/assets/MovePlanTab';
import { NO_MOVE_PLAN } from '@/features/assets/movePlanUrl';
import type { AssetCategory } from '@/features/corp/assetCategories';
import { AssetCategoryPicker, BlueprintKindSelect } from '@/features/assets/AssetCategoryPicker';
import {
  assetPassesKindFilter,
  blueprintKindParam,
  blueprintsTicked,
  categoryPickParam,
  expandLegacyCategoryIds,
  filterIsOpen,
  pickIsAll,
  type AssetKindFilter,
  type CategoryPick,
} from '@/features/assets/assetCategoryFilter';
import { useAssetCategoryIndex } from '@/features/assets/useAssetCategoryIndex';
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
import { NO_ASSET_NAMES } from '@/engine/assetNames';
import { ItemActionsProvider } from '@/features/market/ItemActionsProvider';
import { addQuickbarItem } from '@/features/market/quickbar';
import { useMutaplasmidLookup } from '@/features/abyssal/mutaplasmidData';
import { usePageItemActions } from '@/features/market/usePageItemActions';
import { useBlueprintTypeIds } from '@/features/character/useBlueprintTypeIds';
import { useCompareSet } from '@/features/market/compareSet';
import { writeToClipboard } from '@/lib/clipboard';
import { useRouteSnapshot, type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';
import { useKeyedLoad } from '@/lib/useAsyncLoad';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { useUrlParams } from '@/lib/useUrlState';
import { boolParam, enumParam, optionalIntParam, textParam } from '@/lib/urlState';

const CATEGORY_PARAM = categoryPickParam();

const URL_PARAMS = {
  q: textParam(),
  group: enumParam(['item', 'location'] as const, 'item'),
  loc: optionalIntParam({ min: 1 }),
  div: optionalIntParam({ min: 1, max: 7 }),
  cat: CATEGORY_PARAM,
  bp: blueprintKindParam(),
  below: boolParam(),
};

const EMPTY_PRICES: ReadonlyMap<number, number> = new Map();
const EMPTY_DIVISION_NAMES: ReadonlyMap<number, string | null> = new Map();
const EMPTY_CATEGORIES: ReadonlyMap<number, AssetCategory> = new Map();
const ALL = 'all';
const EMPTY_KEYS: ReadonlySet<string> = new Set();

const MOVE_PLAN_KEYS = Object.keys(NO_MOVE_PLAN);

const TAB_LABEL_KEY: Readonly<Record<CorpAssetTab, string>> = {
  all: 'corp.assets.tab.all',
  offices: 'corp.assets.tab.offices',
  deliveries: 'corp.assets.tab.deliveries',
  inSpace: 'corp.assets.tab.inSpace',
  fuelBay: 'corp.assets.tab.fuelBay',
  impounded: 'corp.assets.tab.impounded',
  assetSafety: 'corp.assets.tab.assetSafety',
  lockdown: 'corp.assets.tab.lockdown',
  capsuleerDeliveries: 'corp.assets.tab.capsuleerDeliveries',
};

const rowKeyOf = (row: ItemLedgerRow) => `${row.typeId}:${row.isBlueprintCopy ? 'c' : 'o'}`;

function CorpAssetsView({
  pageTab,
  canReadBlueprints,
}: {
  pageTab: CorpAssetsPageTab;
  canReadBlueprints: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const tabsId = useTabsId();
  const moving = pageTab === 'move';
  const tab: CorpAssetTab = moving ? 'all' : pageTab;
  const loadSnapshot = useCallback(
    (characterId: number, signal: RouteSnapshotSignal) =>
      loadCorpAssetsSnapshot(characterId, signal, canReadBlueprints),
    [canReadBlueprints]
  );
  const snapshot = useRouteSnapshot<CorpAssetsSnapshot>(loadSnapshot, undefined, {
    staleWhileRevalidate: true,
    cacheKey: 'corp-assets',
  });
  const data = snapshot.data;

  const [params, setParams] = useUrlParams(URL_PARAMS);
  const [debouncedQuery] = useDebouncedValue(params.q);
  const query = debouncedQuery.trim().toLowerCase();
  const byLocation = params.group === 'location';

  const targetsApi = useCorpStockTargets(data?.corporationId ?? null);
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
  const categoryIndex = useAssetCategoryIndex(data !== undefined && data !== null);
  const categoryPick = useMemo<CategoryPick>(
    () => (categoryIndex ? expandLegacyCategoryIds(categoryIndex, params.cat) : params.cat),
    [categoryIndex, params.cat]
  );
  const kindFilter = useMemo<AssetKindFilter | null>(() => {
    if (!categoryIndex) return null;
    const filter = {
      index: categoryIndex,
      pick: categoryPick,
      blueprints: params.bp,
      blueprintTypeIds,
    };
    return filterIsOpen(filter) ? null : filter;
  }, [categoryIndex, categoryPick, params.bp, blueprintTypeIds]);
  const keepKind = useMemo(
    () =>
      kindFilter
        ? (asset: { typeId: number; isBlueprintCopy?: boolean }) =>
            assetPassesKindFilter(
              { type_id: asset.typeId, is_blueprint_copy: asset.isBlueprintCopy },
              kindFilter
            )
        : null,
    [kindFilter]
  );
  const showBlueprintSelect = categoryIndex ? blueprintsTicked(categoryIndex, categoryPick) : false;
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

  const assetNames = data?.assetNames ?? NO_ASSET_NAMES;

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
        if (keepKind && !keepKind(row)) return false;
        return (
          query === '' ||
          labels.typeName(row.typeId).toLowerCase().includes(query) ||
          row.stacks.some((stack) => assetNames[stack.itemId]?.toLowerCase().includes(query))
        );
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
    keepKind,
    targetsApi.targets,
    stock,
    shortTypeIds,
    categoryByTypeId,
    query,
    labels,
    assetNames,
  ]);

  const officeUsageWhole = useMemo(
    () => (byLocation ? officeUsage(buildLocationLedger(classified, valuation)) : new Map()),
    [byLocation, classified, valuation]
  );

  const locationRows = useMemo<LocationRow[]>(() => {
    if (!byLocation) return [];
    const items: ClassifiedAsset[] = filterClassified(classified.items, {
      query,
      kind: keepKind,
      onlyTypeIds: params.below ? shortTypeIds : null,
      typeName: labels.typeName,
    });
    const ledger = buildLocationLedger({ ...classified, items }, valuation);
    return buildLocationRows(ledger, {
      usage: officeUsageWhole,
      filtered:
        query !== '' ||
        keepKind !== null ||
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
    keepKind,
    shortTypeIds,
    query,
    labels,
    officeUsageWhole,
  ]);

  const locationOptions = useMemo(() => {
    const ids = new Set<number>(classified.officeLocationIds);
    for (const item of classified.items) {
      if (item.locationId !== null) ids.add(item.locationId);
    }
    return [...ids]
      .map((id) => ({ id, label: labels.placeName(id) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [classified, labels]);

  const [selectMode, setSelectMode] = useState(false);
  const selectionScope = [
    tab,
    params.loc,
    params.div,
    CATEGORY_PARAM.serialize(params.cat),
    params.bp,
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
  const selectedTypeIds = [...new Set([...selectedKeys].map((key) => Number(key.split(':')[0])))];

  function handleBulkAddToQuickbar() {
    let items = itemActions.quickbar.items;
    for (const typeId of selectedTypeIds) {
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
    const next = new URLSearchParams(location.search);
    for (const key of MOVE_PLAN_KEYS) next.delete(key);
    const search = next.toString();
    void navigate({
      pathname: corpAssetsPageTabPath(id as CorpAssetsPageTab),
      search: search === '' ? '' : `?${search}`,
    });
  }

  function itemsViewHref(row: LocationRow): string {
    const next = new URLSearchParams(location.search);
    next.delete('group');
    next.delete('lsort');
    if (row.locationId === null) next.delete('loc');
    else next.set('loc', String(row.locationId));
    if (row.division === null) next.delete('div');
    else next.set('div', String(row.division));
    const search = next.toString();
    const pathname = corpAssetTabPath(row.kind === 'division' ? tab : tabForState(row.state));
    return search === '' ? pathname : `${pathname}?${search}`;
  }

  if (!snapshot.hydrated) return <Spinner />;

  const placeFilter: PlaceFilter = {
    loc: params.loc,
    div: params.div,
    cat: categoryPick,
    bp: params.bp,
  };
  const activeFilters = activePlaceFilters(
    placeFilter,
    { labels, categoryIndex, showBlueprintSelect },
    t
  );
  const shownCount = byLocation ? locationRows.length : itemRows.length;

  const ledgerTabs = CORP_ASSET_TABS.filter(
    (id) => id === 'all' || id === 'offices' || (!moving && id === tab) || counts[id] > 0
  ).map((id) => ({
    id: id as CorpAssetsPageTab,
    label: t(TAB_LABEL_KEY[id]),
    count: counts[id],
    ...(id === 'impounded' || id === 'assetSafety'
      ? { countTone: 'danger' as const }
      : id === 'deliveries'
        ? { countTone: 'warning' as const }
        : {}),
  }));
  const tabs = [
    ...ledgerTabs,
    { id: 'move' as CorpAssetsPageTab, label: t('corp.assets.tab.move') },
  ];

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
        onChange={(next) => setParams({ loc: next.loc, div: next.div, cat: next.cat, bp: next.bp })}
        active={activeFilters}
        resultCount={shownCount}
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
                <SelectTrigger
                  aria-label={t('corp.assets.filter.location')}
                  active={draft.loc !== null}
                  className="w-56"
                >
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
                <SelectTrigger
                  aria-label={t('corp.assets.filter.division')}
                  active={draft.div !== null}
                  className="w-44"
                >
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
            {categoryIndex && (
              <FilterField label={t('corp.assets.filter.category')}>
                <AssetCategoryPicker
                  index={categoryIndex}
                  pick={draft.cat}
                  active={!pickIsAll(draft.cat)}
                  onChange={(cat) => setDraft({ ...draft, cat })}
                />
              </FilterField>
            )}
            {showBlueprintSelect && (
              <FilterField label={t('assets.blueprints.label')}>
                <BlueprintKindSelect
                  value={draft.bp}
                  active={draft.bp !== 'any'}
                  onChange={(bp) => setDraft({ ...draft, bp })}
                />
              </FilterField>
            )}
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
        <Tooltip
          content={!targetsApi.hydrated || data?.corporationId == null ? t('common.loading') : null}
        >
          <Button
            className="ml-auto"
            aria-disabled={!targetsApi.hydrated || data?.corporationId == null || undefined}
            onClick={() => setTargetsOpen(true)}
          >
            {t('corp.assets.stockTargetsButton')}
          </Button>
        </Tooltip>
      </div>
    </div>
  );

  return (
    <ItemActionsProvider page={itemActions}>
      <div className="mx-auto max-w-page space-y-4">
        <PageHeader
          title={t('corp.assets.title')}
          meta={
            data?.fetchedAt ? (
              <DataAgeBadge date={data.fetchedAt} note={t('corp.dataAgeNote')} />
            ) : undefined
          }
          actions={
            <div className="ml-auto flex items-center gap-1.5">
              {!byLocation && !moving && (
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
                busy={snapshot.loading}
              />
            </div>
          }
        />

        {snapshot.loading && data === null ? (
          <Spinner />
        ) : data === null || data.inputs === null ? (
          <LoadFailedState title={t('common.loadFailed.corpAssets')} onRetry={snapshot.refresh} />
        ) : !hasAnyAssets ? (
          <EmptyState title={t('corp.assets.empty')} />
        ) : (
          <div className="space-y-2">
            {data.fromCache && (
              <CachedNotice
                withBadge
                fetchedAt={data.fetchedAt}
                refreshFailed={snapshot.refreshCount > 0}
              />
            )}
            {data.truncated && (
              <IncompleteNotice
                hint={t('corp.assets.fetchTruncatedNotice', { shown: data.assetsShown })}
              />
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
              value={pageTab}
              onChange={selectTab}
              label={t('corp.assets.tabsLabel')}
              activation="manual"
            />
            <TabPanel tabsId={tabsId} tabId={pageTab} className="space-y-2">
              {moving && snapshot.activeCharacterId !== null ? (
                <MovePlanTab
                  characterIds={[]}
                  activeCharacterId={snapshot.activeCharacterId}
                  corp={{
                    pilotId: snapshot.activeCharacterId,
                    name: t('corp.assets.move.owner'),
                    inputs: data.inputs,
                    version: String(data.fetchedAt?.getTime() ?? ''),
                  }}
                  onClose={() => selectTab('all')}
                />
              ) : (
                <>
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
                          setSelectedKeys(
                            (prev) => new Set([...prev, ...itemRows.map((r) => r.key)])
                          )
                        }
                      >
                        {t('assets.select.selectAllInView')}
                      </Button>
                      <Tooltip
                        content={
                          selectedKeys.size === 0 ? t('assets.select.deselectAllEmpty') : null
                        }
                      >
                        <Button
                          size="sm"
                          aria-disabled={selectedKeys.size === 0 || undefined}
                          onClick={() => setSelectedKeys(() => EMPTY_KEYS)}
                        >
                          {t('assets.select.deselectAll')}
                        </Button>
                      </Tooltip>
                      {selectedKeys.size > 0 && (
                        <>
                          <Tooltip
                            content={
                              itemActions.quickbar.available
                                ? null
                                : t('market.contextMenu.quickbarNoCharacter')
                            }
                          >
                            <Button
                              size="sm"
                              aria-disabled={!itemActions.quickbar.available || undefined}
                              onClick={handleBulkAddToQuickbar}
                            >
                              {t('assets.select.addToQuickbar')}
                            </Button>
                          </Tooltip>
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
                        assetNames={assetNames}
                        itemsViewHref={itemsViewHref}
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
                        assetNames={assetNames}
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
                </>
              )}
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

function CorpAssetsRoute({ canReadBlueprints }: { canReadBlueprints: boolean }) {
  const wildcard = useParams()['*'] ?? '';
  const { search } = useLocation();
  const pageTab = corpAssetsPageTabFromPath(wildcard);
  if (pageTab === null) return <Navigate replace to={{ pathname: '/corp/assets', search }} />;
  return <CorpAssetsView pageTab={pageTab} canReadBlueprints={canReadBlueprints} />;
}

export function CorpAssets() {
  const { t } = useTranslation();
  const gate = useCorpRouteGate((capabilities) => capabilities.canReadAssets);

  const content =
    gate.status === 'denied' ? (
      <div className="mx-auto max-w-page space-y-4">
        <PageHeader title={t('corp.assets.title')} />
        <CorpDenied
          reason={gate.reason}
          title={t('corp.assets.noAccessTitle')}
          hint={t('corp.assets.noAccessHint')}
          roleLine={t('corp.assets.roleLine')}
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
