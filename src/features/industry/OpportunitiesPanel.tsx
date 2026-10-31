/**
 * Build Opportunities (issue #642): ranks every manufacturing blueprint the
 * chosen character(s) own by ISK/hour, owned-materials-adjusted, at the
 * default trade hub — the same seeding/sorting/costing layer over
 * `computeBuildPlan`/`buildVsBuy` that Build Plan Compare already prices
 * plans with, just run over every owned blueprint instead of a hand-picked
 * set. Selected rows seed real Build Plans into Compare via `onAddToCompare`.
 *
 * Whose blueprints it ranks is Industry's one Character filter
 * (`useIndustryCharacterFilter`), the same value Active Jobs reads; its
 * picker rides in the Industry `PageHeader`.
 */
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
  StatChip,
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
import { OPPORTUNITIES_DEFAULT_SORT, OPPORTUNITIES_SORT_KEY } from './opportunitiesUrl';
import {
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
import { useUrlParam, useUrlSort } from '@/lib/useUrlState';
import { enumParam } from '@/lib/urlState';
import { OwnedBlueprintsPanel } from './OwnedBlueprintsPanel';
import { CorpProjectsPanel } from './corpProjects/CorpProjectsPanel';
import { buildableEntry } from './corpProjects/corpProjectRows';
import { useCorpProjects } from './corpProjects/useCorpProjects';
import type { BuildPlanPricingInputs } from './buildPlanPricingInputs';
import {
  OPPORTUNITIES_COLUMN_IDS,
  OPPORTUNITIES_DEFAULT_COLUMNS,
  useVisibleOpportunitiesColumns,
  type OpportunitiesColumnId,
} from './opportunitiesColumns';

interface OpportunitiesPanelProps {
  catalog: BlueprintCatalog;
  pi: PiData | null;
  facilityDefaults: ActivityFacilityDefaults;
  activeCharacterId: number;
  ownedStockSnapshot: OwnedStockSnapshot;
  /**
   * ME to quote an unowned sub-build at — `buildPlanPricingInputs.ts`'s
   * `assumedMe`, the one pricing input this panel reads (#2055).
   * `Industry.tsx` doesn't mount this panel until `pricingInputs.hydrated`,
   * so this is always the pilot's own setting, never the default (#2054).
   */
  assumedMe: number;
  /** What a Build Plan page prices against; the Corp projects view resolves its rows through it. */
  pricingInputs: BuildPlanPricingInputs;
  onAddToCompare: (rows: readonly OpportunityRow[]) => void;
  /** Saves the Corp projects rows' plans and opens Compare with them. */
  onAddProjectsToCompare: (plans: readonly BuildPlanRecord[]) => void;
  /** Resolves true once it has opened the new plan (see `StartPlanButton`). */
  onStartPlan: (entry: BlueprintCatalogEntry, seed?: OpportunityPlanSeed) => Promise<boolean>;
  /**
   * The oldest blueprint fetch behind these rows, or null — reported up
   * rather than drawn here, so the route can show it beside the page title
   * (`PageHeader.meta`) instead of crowding this panel's header.
   */
  onDataAgeChange?: (date: Date | null) => void;
}

/**
 * The columns' sort keys, at module scope: the columns themselves close over
 * selection state and `onStartPlan` (which the parent rebuilds every
 * render), but `DataTable` keys its sort memo on the active `sortValue`, so
 * keeping these stable is what stops a re-render from re-sorting every row.
 */
const SORT_VALUE = {
  product: (row: OpportunityRow) => row.candidate.catalogEntry.productName,
  // -1 means BPO/unlimited runs — sorts as the largest, not the smallest.
  // `MAX_SAFE_INTEGER` rather than `Infinity`: two BPO rows would compare
  // `Infinity - Infinity`, which is `NaN`.
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
/**
 * Ranked (the default) or "All owned" (issue #2335): the same owned
 * blueprints and Character filter, either priced and ranked or listed whole.
 */
const VIEW_PARAM = enumParam(['ranked', 'owned', 'corp'] as const, 'ranked');
/** "Use my stock" (issue #2847): narrow Ranked to builds owned stock covers. */
const STOCK_PARAM = enumParam(['any', 'mostly', 'full'] as const, 'any');

/** Module-level so the table's windowing sees one stable function. */
const opportunityRowKey = (row: OpportunityRow) => row.candidate.id;

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

  const { candidates: characterCandidates, namesById: characterNames } = useAccountCharacters();

  const [urlView, setView] = useUrlParam('opps.view', VIEW_PARAM);
  const [stockFilter, setStockFilter] = useUrlParam('opps.stock', STOCK_PARAM);
  // Industry's one page-wide filter; its picker rides in the Industry `PageHeader`.
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

  // Corp projects (issue #4786) is a view only for a Character that can see
  // some: no permission, no corporation or no open manufacture project leaves
  // it out, and a stale `?opps.view=corp` then reads as Ranked.
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
  // The option stays listed while the corp view is open, even as the reads refresh.
  const corpOptionShown = showCorpProjects || view === 'corp';

  // Every candidate's own Build Plan, for `hubForCharacter` below (issue
  // #2055): the same Trade Hub a fresh plan for that Character would default
  // to (`mostRecentlyUpdatedPlan`'s rule), not a hard-coded default.
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
  const resolveHubForCharacter = useMemo(
    () => (characterId: number) => hubForCharacter(characterId, plansByCharacter),
    [plansByCharacter]
  );

  // The same latest plan, whose price basis and build location a fresh plan starts
  // from: rows price with the plan page's settings, not their own defaults.
  const defaultsForCharacter = useMemo(
    () => (characterId: number) => mostRecentlyUpdatedPlan(plansByCharacter.get(characterId)),
    [plansByCharacter]
  );

  // Each owning Character's own standings/skills (issue #2055), not just the
  // active Character's — a candidate seeded by an alt prices at that alt's
  // real broker fee, not the pilot currently viewing the panel.
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
  });

  // Each product's history in its own row's hub region, for "vs 90d". Held while
  // ranking streams partial rows (each batch would restart the fan-out), and
  // never for All owned, which has no such column.
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
        .filter((row) => matchesStockFilter(row, stockFilter))
        .map((row) => ({
          ...row,
          vs90d: priceVsMedianFor(
            priceVsMedian,
            row.hub.id,
            row.candidate.catalogEntry.productTypeID
          ),
        })),
    [allRows, stockFilter, priceVsMedian]
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

  // Account-wide, not this panel's own `characterFilter` (issue #1231): a
  // gate must stay true regardless of which character the filter happens to
  // be scoped to, the same precedent `MarketWideOpportunitiesPanel` sets.
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

  // Mounting `PriceHistoryPanel` reads the item's market history
  // (`loadPriceHistory`) for the chart — kept out of the row tree until a
  // pilot asks for one. The "vs 90d" column already read the same series
  // through the shared cache, so opening a row costs no new request.
  const [historyItem, setHistoryItem] = useState<{
    typeId: number;
    itemName: string;
    regionId: number;
  } | null>(null);

  // The desktop twin of the phone card's "…" menu: the shared item menu plus
  // Price history, the one action the ranked row's click doesn't carry.
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

  // A row click is the Start plan button's action, so the product name needs no link of its own.
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
      // Desktop-only column now (`isDesktop` gates this whole `DataTable`
      // below — see the render branch): the `cardCorner`/enlarged-target
      // fix this column carried for the stacked layout moved to
      // `MobileOpportunityList`'s own corner-pinned checkbox once the phone
      // list stopped going through `DataTable` at all.
      id: 'select',
      header: '',
      width: COL_ICON,
      // The label is the 36px touch target on a coarse pointer; it grows the cell, never overlays a neighbour.
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
      render: (row) => {
        const original = row.candidate.blueprint.runs === -1;
        return (
          <StatChip
            label={original ? t('industry.bpo') : t('industry.bpc')}
            value={
              original ? t('industry.opportunitiesUnlimitedRuns') : row.candidate.blueprint.runs
            }
            tone={original ? 'accent' : 'default'}
          />
        );
      },
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
        numericCell(
          unitMargin(row),
          // Tap: the figure is inert — the row's own controls are buttons of their own.
          (v) => <IskAmount value={v} decimals={0} />,
          unknown
        ),
    },
    {
      id: 'margin',
      header: t('industry.margin'),
      width: COL_SMALL_NUMBER,
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.margin,
      render: (row) => numericCell(row.result.marginPct, formatPercent, unknown),
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
        numericCell(
          row.result.iskPerHour,
          // Tap: the figure is inert — the row's own controls are buttons of their own.
          (v) => <IskAmount value={v} decimals={0} />,
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
      // Same pattern `MarketWideOpportunitiesPanel` sets (issue #1781): a
      // direct per-row action rather than routing every plan through the
      // Compare button, which needs 2+ selected rows to do anything.
      id: 'action',
      header: '',
      width: '16ch',
      render: (row) => (
        <StartPlanButton
          onStart={() => onStartPlan(row.candidate.catalogEntry, row)}
          planKey={row.candidate.catalogEntry}
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

  // `undefined` on desktop, not an empty element: `Panel` pads its header by `leading`'s truthiness.
  const viewPicker = isDesktop ? undefined : (
    <OpportunitiesViewPicker
      view={view}
      onViewChange={setView}
      showCorpProjects={corpOptionShown}
    />
  );
  const meta = (
    <OpportunitiesFilterBar
      view={view}
      onViewChange={setView}
      showCorpProjects={corpOptionShown}
      stockFilter={stockFilter}
      onStockFilterChange={setStockFilter}
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
          <EmptyState
            title={t('industry.opportunitiesEmptyTitle')}
            hint={t('industry.opportunitiesEmptyHint')}
            className="py-8"
          />
        ) : needsRefresh ? (
          <EmptyState
            title={t('industry.opportunitiesNeedsRefreshTitle')}
            hint={t('industry.opportunitiesNeedsRefreshHint')}
            className="py-8"
          />
        ) : stockFilter !== 'any' && rows.length === 0 && allRows.length > 0 ? (
          <EmptyState
            title={t('industry.opportunitiesStockEmptyTitle')}
            hint={t('industry.opportunitiesStockEmptyHint')}
            action={
              <Button size="sm" onClick={() => setStockFilter('any')}>
                {t('common.resetFilters')}
              </Button>
            }
            className="py-8"
          />
        ) : isDesktop ? (
          <div className="overflow-x-auto">
            <DataTable
              {...opportunitiesExport.tableProps}
              columns={shownColumns}
              rows={rows}
              rowKey={opportunityRowKey}
              virtualize="auto"
              label={t('industry.opportunitiesTableLabel')}
              onRowClick={startPlanFromRow}
              rowContextMenu={rowContextMenu}
              rowMoreActions
              {...sortProps}
            />
          </div>
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
