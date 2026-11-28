import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useMemo, useState, type ReactElement } from 'react';
import { useCharacterModifiersByCharacter } from '@/features/character/characterModifiers';
import { useTradeHubStandingsByCharacter } from '@/features/market/useTradeHubStandings';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAccountCharacters } from '@/features/character/useCharacters';
import { db, type BuildPlanRecord } from '@/db';
import { mostRecentlyUpdatedPlan } from './newBuildPlan';
import {
  Button,
  DataTable,
  EmptyState,
  LiveStatus,
  InfoTooltip,
  IskAmount,
  Modal,
  Panel,
  Spinner,
  type DataTableColumn,
  Checkbox,
  ColumnPickerMenu,
  STAT_CHIP_TONE_TEXT_CLASS,
  MenuItem,
  CachedNotice,
} from '@/components/ui';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { DataGate } from '@/components/DataGate';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { iskToneClass } from '@/features/character/format';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { useIsXlUp } from '@/lib/useIsXlUp';
import { evaluateSkillGate, type SkillGateVerdict } from '@/engine/industry/skillGate';
import type { PiData } from '@/sde/types';
import { useRowStartPlan } from './rowStartPlan';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { PriceHistoryPanel } from '@/features/market/PriceHistoryPanel';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import { nameForType, type BlueprintCatalog, type BlueprintCatalogEntry } from './blueprintCatalog';
import type { ActivityFacilityDefaults } from './facilityDefaults';
import { formatPercent, numericCell } from './format';
import { MobileOpportunityList } from './MobileOpportunityList';
import {
  OPPORTUNITIES_ACTIVITY_KEY,
  OPPORTUNITIES_ACTIVITY_PARAM,
  OPPORTUNITIES_DEFAULT_SORT,
  OPPORTUNITIES_SORT_KEY,
} from './opportunitiesUrl';
import { OpportunityBlueprintChip } from './OpportunityBlueprintChip';
import {
  blueprintKindKey,
  matchesActivityFilter,
  matchesStockFilter,
  ORDER_DEPTH_RANK,
  ORDER_DEPTH_TONE,
  stockCoverage,
  unitMargin,
} from './opportunityMetrics';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import {
  AUTO_RECALCULATE_MAX,
  hubForCharacter,
  isReaction,
  type OpportunityPlanSeed,
  type OpportunityRow,
} from './opportunities';
import { SkillGateMarker } from './SkillGateMarker';
import { useOpportunities } from './useOpportunities';
import { useOpportunityCandidates } from './useOpportunityCandidates';
import { OpportunitiesFilterBar, OpportunitiesViewPicker } from './OpportunitiesToolbars';
import { priceVsMedianFor, usePriceVsMedian } from './usePriceVsMedian';
import { Vs90dFigure } from './Vs90dFigure';
import { vs90dTooltip } from './vs90d';
import { StartPlanButton } from './StartPlanButton';
import { COL_ICON, COL_SMALL_NUMBER } from '@/components/ui/dataTableWidths';
import { opportunitiesCsvColumns, skillGateExport } from './opportunitiesCsv';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useIndustryCharacterFilter } from './industryCharacterFilter';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useUrlParam, useUrlParams, useUrlSort } from '@/lib/useUrlState';
import { enumParam } from '@/lib/urlState';
import { OwnedBlueprintsPanel } from './OwnedBlueprintsPanel';
import { CorpProjectsPanel } from './corpProjects/CorpProjectsPanel';
import { buildableEntry } from './corpProjects/corpProjectRows';
import { useCorpProjects } from './corpProjects/useCorpProjects';
import type { BuildPlanPricingInputs } from './buildPlanPricingInputs';
import { useHubFor } from '@/features/market/hub';
import { usePricePercentFor } from '@/features/market/pagePricePercents';
import {
  OPPORTUNITIES_COLUMN_IDS,
  OPPORTUNITIES_DEFAULT_COLUMNS,
  useVisibleOpportunitiesColumns,
  type OpportunitiesColumnId,
} from './opportunitiesColumns';
import { TableScroll } from '@/components/ui/TableScroll';

interface OpportunitiesPanelProps {
  catalog: BlueprintCatalog;
  pi: PiData | null;
  facilityDefaults: ActivityFacilityDefaults;
  activeCharacterId: number;
  ownedStockSnapshot: OwnedStockSnapshot;
  assumedMe: number;
  pricingInputs: BuildPlanPricingInputs;
  onAddToCompare: (rows: readonly OpportunityRow[]) => void;
  onAddProjectsToCompare: (plans: readonly BuildPlanRecord[]) => void;
  onStartPlan: (entry: BlueprintCatalogEntry, seed?: OpportunityPlanSeed) => Promise<boolean>;
  onDataAgeChange?: (date: Date | null) => void;
}

const SORT_VALUE = {
  product: (row: OpportunityRow) => row.candidate.catalogEntry.productName,
  blueprint: (row: OpportunityRow) =>
    row.candidate.blueprint.runs === -1 ? Number.MAX_SAFE_INTEGER : row.candidate.blueprint.runs,
  unitMargin: (row: OpportunityRow) => unitMargin(row) ?? undefined,
  margin: (row: OpportunityRow) => row.result.marginPct ?? undefined,
  vs90d: (row: OpportunityRow) => row.vs90d ?? undefined,
  stockCovers: (row: OpportunityRow) => stockCoverage(row)?.coveredPct,
  stillToBuy: (row: OpportunityRow) => stockCoverage(row)?.stillToBuyIsk,
  duration: (row: OpportunityRow) => row.result.seconds,
  iskPerHour: (row: OpportunityRow) => row.result.iskPerHour ?? undefined,
  orderDepth: (row: OpportunityRow) => ORDER_DEPTH_RANK[row.orderDepth],
};
const VIEW_PARAM = enumParam(['ranked', 'owned', 'corp'] as const, 'ranked');
const STOCK_PARAM = enumParam(['any', 'mostly', 'full'] as const, 'any');
const FILTER_PARAMS = {
  'opps.stock': STOCK_PARAM,
  [OPPORTUNITIES_ACTIVITY_KEY]: OPPORTUNITIES_ACTIVITY_PARAM,
};

const opportunityRowKey = (row: OpportunityRow) => row.candidate.id;
const opportunityRowClassName = (row: OpportunityRow) =>
  row.reactionLocation ? 'text-text-dim' : undefined;

export function OpportunitiesPanel({
  catalog,
  pi,
  facilityDefaults,
  activeCharacterId,
  ownedStockSnapshot,
  assumedMe,
  pricingInputs,
  onAddToCompare,
  onAddProjectsToCompare,
  onStartPlan,
  onDataAgeChange,
}: OpportunitiesPanelProps) {
  const { t } = useTranslation();
  const unknown = t('common.unknown');
  const isDesktop = useIsDesktop();
  const xlUp = useIsXlUp();

  const { candidates: characterCandidates, namesById: characterNames } = useAccountCharacters();

  const [urlView, setView] = useUrlParam('opps.view', VIEW_PARAM);
  const [filters, setFilters] = useUrlParams(FILTER_PARAMS);
  const stockFilter = filters['opps.stock'];
  const activityFilter = filters[OPPORTUNITIES_ACTIVITY_KEY];
  const [characterFilter] = useIndustryCharacterFilter();
  const {
    characterIds,
    characterIdsKey,
    candidates,
    ownedByCharacter,
    blueprintsLoading,
    failedCount,
    cachedAt,
    allBlueprintsFailed,
    retry,
  } = useOpportunityCandidates({
    catalog,
    activeCharacterId,
    characterFilter,
    characterCandidates,
    characterNames,
    onDataAgeChange,
  });

  const corpProjects = useCorpProjects(characterIds);
  const corpEntries = useMemo(
    () =>
      corpProjects.entries.flatMap((entry) => {
        const projects = entry.projects.filter((p) => buildableEntry(p, catalog) !== null);
        return projects.length > 0 ? [{ ...entry, projects }] : [];
      }),
    [corpProjects.entries, catalog]
  );
  const showCorpProjects = corpEntries.length > 0;
  const view =
    urlView === 'corp' && !showCorpProjects && !corpProjects.loading ? 'ranked' : urlView;
  const corpOptionShown = showCorpProjects || view === 'corp';

  const plansQuery = useLiveQuery(
    () => db.buildPlans.where('characterId').anyOf(characterIds).toArray(),
    [characterIds],
    []
  );
  const plansByCharacter = useMemo(() => {
    const map = new Map<number, BuildPlanRecord[]>();
    for (const plan of plansQuery ?? []) {
      const list = map.get(plan.characterId);
      if (list) list.push(plan);
      else map.set(plan.characterId, [plan]);
    }
    return map;
  }, [plansQuery]);
  const { hubId: industryHubId } = useHubFor('industry');
  const industryPricePercent = usePricePercentFor('industry');
  const resolveHubForCharacter = useMemo(
    () => (characterId: number) => hubForCharacter(characterId, plansByCharacter),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hubForCharacter reads the Industry hub from its store
    [plansByCharacter, industryHubId]
  );

  const defaultsForCharacter = useMemo(
    () => (characterId: number) => mostRecentlyUpdatedPlan(plansByCharacter.get(characterId)),
    [plansByCharacter]
  );

  const modifiersByCharacter = useCharacterModifiersByCharacter(characterIds, {
    skipQueueWithoutScope: true,
    levels: 'effective',
  });
  const standingsByCharacter = useTradeHubStandingsByCharacter(characterIds);

  const {
    rows: allRows,
    loading,
    progress,
    manualRefreshOnly,
    needsRefresh,
    refresh,
  } = useOpportunities({
    candidates,
    catalog,
    pi,
    hubForCharacter: resolveHubForCharacter,
    defaultsForCharacter,
    facilityDefaults,
    modifiersByCharacter,
    standingsByCharacter,
    ownedStockSnapshot,
    ownedByCharacter,
    assumedMe,
    profitBasis: pricingInputs.profitBasis,
    pricePercent: industryPricePercent,
  });

  const vs90dTargets = useMemo(
    () =>
      view !== 'ranked' || loading
        ? []
        : allRows.flatMap((row) => {
            const typeId = row.candidate.catalogEntry.productTypeID;
            return typeId === null ? [] : [{ hubId: row.hub.id, typeId }];
          }),
    [allRows, view, loading]
  );
  const priceVsMedian = usePriceVsMedian(vs90dTargets);
  const rows = useMemo(
    () =>
      allRows
        .filter(
          (row) =>
            matchesActivityFilter(row, activityFilter) && matchesStockFilter(row, stockFilter)
        )
        .map((row) => ({
          ...row,
          vs90d: priceVsMedianFor(
            priceVsMedian,
            row.hub.id,
            row.candidate.catalogEntry.productTypeID
          ),
        })),
    [allRows, activityFilter, stockFilter, priceVsMedian]
  );
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const selectedRows = rows.filter((row) => selectedIds.has(row.candidate.id));

  const skillGateCharacterIds = useMemo(
    () => characterCandidates.map((c) => c.characterId),
    [characterCandidates]
  );
  const accountSkills = useAccountSkillLevels(skillGateCharacterIds);
  const skillGateByProductTypeID = useMemo(() => {
    const verdicts = new Map<number, SkillGateVerdict>();
    for (const row of rows) {
      const productTypeID = row.candidate.catalogEntry.productTypeID;
      if (productTypeID === null || verdicts.has(productTypeID)) continue;
      verdicts.set(
        productTypeID,
        evaluateSkillGate(row.candidate.catalogEntry.blueprint.skills, accountSkills)
      );
    }
    return verdicts;
  }, [rows, accountSkills]);

  const [historyItem, setHistoryItem] = useState<{
    typeId: number;
    itemName: string;
    regionId: number;
  } | null>(null);

  function rowContextMenu(row: OpportunityRow, tr: ReactElement) {
    const { productTypeID, productName } = row.candidate.catalogEntry;
    if (productTypeID === null) return tr;
    return (
      <ItemContextMenu
        typeId={productTypeID}
        itemName={productName}
        extraItems={
          <MenuItem
            onSelect={() =>
              setHistoryItem({
                typeId: productTypeID,
                itemName: productName,
                regionId: row.hub.regionId,
              })
            }
          >
            {t('industry.opportunitiesPriceHistory')}
          </MenuItem>
        }
      >
        {tr}
      </ItemContextMenu>
    );
  }

  const productBlueprints = new Map<number | null, Set<string>>();
  for (const { candidate } of rows) {
    const id = candidate.catalogEntry.productTypeID;
    const kinds = productBlueprints.get(id) ?? new Set<string>();
    kinds.add(`${blueprintKindKey(candidate)}:${candidate.blueprint.runs}`);
    productBlueprints.set(id, kinds);
  }
  const showCharacterColumn = new Set(rows.map((r) => r.candidate.characterId)).size > 1;

  const csvColumns = useMemo(
    () =>
      opportunitiesCsvColumns(
        t,
        skillGateExport(skillGateByProductTypeID, catalog, characterNames)
      ),
    [t, skillGateByProductTypeID, catalog, characterNames]
  );
  const opportunitiesExport = useTableExport({
    surface: 'industry-opportunities',
    rows,
    columns: csvColumns,
  });

  const startPlanFromRow = useRowStartPlan(
    (row: OpportunityRow) => onStartPlan(row.candidate.catalogEntry, row),
    (row) => row.candidate.catalogEntry
  );

  const { visible, isVisible, toggle, reset } = useColumnVisibility(
    useVisibleOpportunitiesColumns,
    OPPORTUNITIES_DEFAULT_COLUMNS
  );

  const columns: DataTableColumn<OpportunityRow>[] = [
    {
      id: 'select',
      header: '',
      width: COL_ICON,
      render: (row) => (
        <label className={touchCheckboxLabelClassName}>
          <Checkbox
            checked={selectedIds.has(row.candidate.id)}
            onChange={() => toggleSelected(row.candidate.id)}
            aria-label={t('industry.opportunitiesSelectFor', {
              name: row.candidate.catalogEntry.productName,
            })}
          />
        </label>
      ),
    },
    {
      id: 'product',
      header: t('industry.product'),
      primary: true,
      sortValue: SORT_VALUE.product,
      render: (row) => {
        const productTypeID = row.candidate.catalogEntry.productTypeID;
        const verdict = productTypeID !== null ? skillGateByProductTypeID.get(productTypeID) : null;
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className={entityLinkClassName()}>{row.candidate.catalogEntry.productName}</span>
            {verdict?.gated && (
              <SkillGateMarker
                verdict={verdict}
                nameForSkill={(typeID) => nameForType(catalog, typeID)}
                nameForCharacter={(id) => characterNames.get(id) ?? unknown}
              />
            )}
            {productTypeID !== null &&
              (productBlueprints.get(productTypeID)?.size ?? 0) > 1 &&
              !isVisible('blueprint') && <OpportunityBlueprintChip candidate={row.candidate} />}
            {showCharacterColumn && (
              <span className="text-[0.6875rem]">{row.candidate.characterName}</span>
            )}
          </span>
        );
      },
    },
    {
      id: 'blueprint',
      header: t('industry.opportunitiesBlueprint'),
      width: '20ch',
      sortValue: SORT_VALUE.blueprint,
      render: (row) => <OpportunityBlueprintChip candidate={row.candidate} />,
    },
    {
      id: 'unitMargin',
      header: t('industry.opportunitiesUnitMargin'),
      width: '12ch',
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.unitMargin,
      cellClassName: (row) => {
        const margin = unitMargin(row);
        return margin !== null ? iskToneClass(margin) : undefined;
      },
      render: (row) =>
        row.reactionLocation
          ? null
          : numericCell(unitMargin(row), (v) => <IskAmount value={v} decimals={0} />, unknown),
    },
    {
      id: 'margin',
      header: t('industry.margin'),
      width: '9.5ch',
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.margin,
      render: (row) =>
        row.reactionLocation ? null : numericCell(row.result.marginPct, formatPercent, unknown),
    },
    {
      id: 'vs90d',
      header: t('industry.vs90d'),
      width: COL_SMALL_NUMBER,
      headerTooltip: vs90dTooltip(t),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.vs90d,
      render: (row) => <Vs90dFigure value={row.vs90d} />,
    },
    {
      id: 'stockCovers',
      header: t('industry.opportunitiesStockCovers'),
      width: '10ch',
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.stockCovers,
      render: (row) => numericCell(stockCoverage(row)?.coveredPct ?? null, formatPercent, unknown),
    },
    {
      id: 'stillToBuy',
      header: t('industry.opportunitiesStillToBuy'),
      width: '12ch',
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.stillToBuy,
      render: (row) =>
        numericCell(
          stockCoverage(row)?.stillToBuyIsk ?? null,
          (v) => <IskAmount value={v} decimals={0} />,
          unknown
        ),
    },
    {
      id: 'duration',
      header: t('industry.time'),
      width: '12ch',
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.duration,
      render: (row) => formatDuration(row.result.seconds),
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      width: '12ch',
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.iskPerHour,
      cellClassName: (row) =>
        row.result.iskPerHour !== null ? iskToneClass(row.result.iskPerHour) : undefined,
      render: (row) =>
        row.reactionLocation
          ? t('industry.opportunitiesSetReactionLocation')
          : numericCell(
              row.result.iskPerHour,
              (v) => (
                <span className="inline-flex items-center justify-end gap-1">
                  <IskAmount value={v} decimals={0} />
                  {row.priceCapped && (
                    <InfoTooltip
                      label={t('industry.marketOpportunitiesPriceCapped')}
                      content={t('industry.marketOpportunitiesPriceCapped')}
                    />
                  )}
                </span>
              ),
              unknown
            ),
    },
    {
      id: 'orderDepth',
      header: t('industry.opportunitiesOrderDepthLabel'),
      width: '14ch',
      sortValue: SORT_VALUE.orderDepth,
      render: (row) => (
        <span className="flex items-center gap-1">
          <span className={STAT_CHIP_TONE_TEXT_CLASS[ORDER_DEPTH_TONE[row.orderDepth]]}>
            {t(`industry.opportunitiesOrderDepth.${row.orderDepth}`)}
          </span>
          {row.result.profit !== null && row.result.profit < 0 && (
            <InfoTooltip
              label={t('industry.opportunitiesLossBreakdownFor', {
                name: row.candidate.catalogEntry.productName,
              })}
              content={t(
                row.forgoneSale > 0
                  ? 'industry.opportunitiesLossBreakdownWithStock'
                  : 'industry.opportunitiesLossBreakdown',
                {
                  forgone: formatIsk(row.forgoneSale),
                  cost: formatIsk(row.result.totalCost),
                  revenue: row.result.revenue !== null ? formatIsk(row.result.revenue) : unknown,
                }
              )}
            />
          )}
        </span>
      ),
    },
    {
      id: 'action',
      header: '',
      width: xlUp ? '16ch' : COL_ICON,
      render: (row) => (
        <StartPlanButton
          onStart={() => onStartPlan(row.candidate.catalogEntry, row)}
          planKey={row.candidate.catalogEntry}
          compact={xlUp ? undefined : { name: row.candidate.catalogEntry.productName }}
        />
      ),
    },
  ];
  const columnsById = Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
    OpportunitiesColumnId,
    DataTableColumn<OpportunityRow>
  >;
  const shownColumns = columns.filter(
    (column) =>
      !(OPPORTUNITIES_COLUMN_IDS as readonly string[]).includes(column.id) ||
      isVisible(column.id as OpportunitiesColumnId)
  );
  const sortProps = useUrlSort(
    OPPORTUNITIES_SORT_KEY,
    OPPORTUNITIES_DEFAULT_SORT,
    columns.map((column) => column.id)
  );

  const viewPicker = isDesktop ? undefined : (
    <OpportunitiesViewPicker
      view={view}
      onViewChange={setView}
      showCorpProjects={corpOptionShown}
    />
  );
  const ownsNoBlueprints = [...ownedByCharacter.values()].every((list) => list.length === 0);
  const hideFilters =
    ownsNoBlueprints &&
    !blueprintsLoading &&
    failedCount === 0 &&
    view === 'ranked' &&
    !corpOptionShown;
  const empty = ownsNoBlueprints
    ? { title: t('industry.opportunitiesEmptyTitle'), hint: t('industry.opportunitiesEmptyHint') }
    : {
        title: t('industry.opportunitiesNothingRankableTitle'),
        hint: t('industry.opportunitiesNothingRankableHint'),
      };
  const ownsReactions = useMemo(() => candidates.some(isReaction), [candidates]);
  const meta = hideFilters ? undefined : (
    <OpportunitiesFilterBar
      view={view}
      onViewChange={setView}
      showCorpProjects={corpOptionShown}
      stockFilter={stockFilter}
      onStockFilterChange={(next) => setFilters({ 'opps.stock': next })}
      activityFilter={activityFilter}
      onActivityFilterChange={(next) => setFilters({ [OPPORTUNITIES_ACTIVITY_KEY]: next })}
      showActivityFilter={ownsReactions || activityFilter !== 'all'}
    />
  );
  const title = isDesktop ? t('industry.opportunitiesTitle') : undefined;

  const showProgress = loading && progress.total > 0;
  const pricingActions = (
    <>
      {showProgress && (
        <span className="text-xs text-text-dim tabular-nums">
          {t('industry.opportunitiesProgress', { done: progress.done, total: progress.total })}
        </span>
      )}
      {manualRefreshOnly && (
        <>
          <Button size="sm" onClick={refresh} aria-disabled={loading || undefined}>
            {t('industry.opportunitiesRefresh')}
          </Button>
          <span className="text-xs text-text-dim max-md:sr-only">
            {t('industry.opportunitiesManualOnly', { count: AUTO_RECALCULATE_MAX })}
          </span>
        </>
      )}
    </>
  );

  if (view === 'corp') {
    return (
      <CorpProjectsPanel
        title={title}
        leading={viewPicker}
        meta={meta}
        entries={corpEntries}
        loading={corpProjects.loading}
        catalog={catalog}
        pi={pi}
        pricingInputs={pricingInputs}
        facilityDefaults={facilityDefaults}
        assumedMe={assumedMe}
        ownedStockSnapshot={ownedStockSnapshot}
        ownedByCharacter={ownedByCharacter}
        characterNames={characterNames}
        hubFor={resolveHubForCharacter}
        modifiersByCharacter={modifiersByCharacter}
        onAddToCompare={onAddProjectsToCompare}
      />
    );
  }

  if (view === 'owned') {
    return (
      <OwnedBlueprintsPanel
        catalog={catalog}
        activeCharacterId={activeCharacterId}
        ownedByCharacter={ownedByCharacter}
        characterNames={characterNames}
        rankedRows={allRows}
        ownedStockSnapshot={ownedStockSnapshot}
        loading={blueprintsLoading}
        title={title}
        leading={viewPicker}
        meta={meta}
        pricingActions={pricingActions}
        onStartPlan={onStartPlan}
      />
    );
  }

  return (
    <Panel
      title={title}
      leading={viewPicker}
      meta={meta}
      actions={
        <span className="flex items-center gap-2">
          {pricingActions}
          {isDesktop && selectedRows.length > 1 && (
            <Button size="sm" variant="primary" onClick={() => onAddToCompare(selectedRows)}>
              {t('industry.opportunitiesAddToCompare', { count: selectedRows.length })}
            </Button>
          )}
          {isDesktop && rows.length > 0 && (
            <ColumnPickerMenu
              size="sm"
              available={OPPORTUNITIES_COLUMN_IDS}
              visible={visible}
              columnsById={columnsById}
              onToggle={toggle}
              onReset={reset}
              buttonLabel={t('common.columnsButton')}
              menuTitle={t('common.columnsMenuTitle')}
              resetLabel={t('common.resetColumns')}
            />
          )}
          {rows.length > 0 && (
            <TableActionsMenu
              name={t('industry.opportunitiesTableLabel')}
              tableExport={opportunitiesExport}
            />
          )}
        </span>
      }
    >
      <DataGate
        status={
          blueprintsLoading
            ? 'busy'
            : candidates.length === 0 && allBlueprintsFailed
              ? 'failed'
              : 'ok'
        }
        title={t('common.couldntLoad')}
        hint={t('industry.opportunitiesLoadFailedHint')}
        onRetry={retry}
        resetKey={characterIdsKey}
        busy={<Spinner block="panel" label={t('common.loading')} />}
      >
        <LiveStatus>
          {failedCount > 0 && !allBlueprintsFailed
            ? t('industry.opportunitiesSomeFailed', { count: failedCount })
            : ''}
        </LiveStatus>
        {!allBlueprintsFailed &&
          (failedCount > 0 ? (
            <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
              {t('industry.opportunitiesSomeFailed', { count: failedCount })}
            </p>
          ) : (
            cachedAt !== null && <CachedNotice className="px-3 pt-2" fetchedAt={cachedAt} />
          ))}
        {candidates.length === 0 ? (
          <EmptyState title={empty.title} hint={empty.hint} className="py-8" />
        ) : needsRefresh ? (
          <EmptyState
            title={t('industry.opportunitiesNeedsRefreshTitle')}
            hint={t('industry.opportunitiesNeedsRefreshHint')}
            className="py-8"
          />
        ) : (stockFilter !== 'any' || activityFilter !== 'all') &&
          rows.length === 0 &&
          allRows.length > 0 ? (
          <EmptyState
            title={t(
              activityFilter === 'all'
                ? 'industry.opportunitiesStockEmptyTitle'
                : 'industry.opportunitiesFilterEmptyTitle'
            )}
            hint={t(
              activityFilter === 'all'
                ? 'industry.opportunitiesStockEmptyHint'
                : 'industry.opportunitiesFilterEmptyHint'
            )}
            action={
              <Button
                size="sm"
                onClick={() =>
                  setFilters({ 'opps.stock': 'any', [OPPORTUNITIES_ACTIVITY_KEY]: 'all' })
                }
              >
                {t('common.resetFilters')}
              </Button>
            }
            className="py-8"
          />
        ) : isDesktop ? (
          <TableScroll>
            <DataTable
              {...opportunitiesExport.tableProps}
              columns={shownColumns}
              rows={rows}
              rowKey={opportunityRowKey}
              rowClassName={opportunityRowClassName}
              virtualize="auto"
              density={xlUp ? 'default' : 'compact'}
              label={t('industry.opportunitiesTableLabel')}
              onRowClick={startPlanFromRow}
              rowContextMenu={rowContextMenu}
              rowMoreActions
              {...sortProps}
            />
          </TableScroll>
        ) : (
          <MobileOpportunityList
            rows={rows}
            showCharacterColumn={showCharacterColumn}
            selectedIds={selectedIds}
            onToggleSelected={toggleSelected}
            onClearSelected={() => setSelectedIds(new Set())}
            onCompare={onAddToCompare}
            onStartPlan={onStartPlan}
            onViewHistory={(typeId, itemName, regionId) =>
              setHistoryItem({ typeId, itemName, regionId })
            }
            skillGateFor={(productTypeID) => skillGateByProductTypeID.get(productTypeID)}
            nameForSkill={(typeID) => nameForType(catalog, typeID)}
            nameForCharacter={(id) => characterNames.get(id) ?? unknown}
          />
        )}
      </DataGate>
      {historyItem && (
        <Modal
          open
          onClose={() => setHistoryItem(null)}
          title={t('industry.opportunitiesPriceHistoryTitle', { name: historyItem.itemName })}
          placement="wide"
        >
          <PriceHistoryPanel
            regionId={historyItem.regionId}
            typeId={historyItem.typeId}
            itemName={historyItem.itemName}
          />
        </Modal>
      )}
    </Panel>
  );
}
