/**
 * Market-Wide Build Opportunities (issue #819): a second panel on the
 * Opportunities tab, ranking manufacturable products market-wide by
 * ISK/hour, independent of ownership — a cold-start "what should I build,
 * starting from nothing" answer. Opt-in: nothing runs until the pilot hits
 * "Scan".
 */
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { useTranslation } from 'react-i18next';
import { useCharacterNames } from '@/features/character/useCharacters';
import {
  Button,
  CollapsiblePanel,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  EmptyState,
  InfoTooltip,
  IskAmount,
  MenuItem,
  Modal,
  LiveStatus,
  Spinner,
  Tooltip,
  type DataTableColumn,
  type StatChipTone,
  STAT_CHIP_TONE_TEXT_CLASS,
} from '@/components/ui';
import { DataGate } from '@/components/DataGate';
import { useOnline } from '@/stores/network';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { PriceHistoryPanel } from '@/features/market/PriceHistoryPanel';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { iskToneClass } from '@/features/character/format';
import { formatDuration } from '@/lib/duration';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { evaluateSkillGate, type SkillGateVerdict } from '@/engine/industry/skillGate';
import { BLUEPRINT_SOURCE_RANK } from '@/engine/industry/blueprintObtainability';
import type { OrderDepthLevel } from '@/engine/industry/opportunities';
import type { MarketWideTreeMap } from '@/sde/types';
import type { TradeHub } from '@/market/hubs';
import {
  MARKET_WIDE_COLUMN_IDS,
  MARKET_WIDE_DEFAULT_COLUMNS,
  useVisibleMarketWideColumns,
  type MarketWideColumnId,
} from './marketWideColumns';
import { useRowStartPlan } from './rowStartPlan';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import { nameForType, type BlueprintCatalog, type BlueprintCatalogEntry } from './blueprintCatalog';
import type { MarketWideDayRow, MarketWideResultRow } from './marketWideOpportunities';
import { iskPerDay } from '@/engine/industry/iskPerDay';
import { useSalesShare } from './salesSharePref';
import { useMarketWideOpportunities } from './useMarketWideOpportunities';
import { SkillGateMarker } from './SkillGateMarker';
import { ORDER_DEPTH_RANK } from './opportunityMetrics';
import { StartPlanButton } from './StartPlanButton';
import { formatPercent, numericCell } from './format';
import {
  filterFromParamValues,
  paramsPatchFromFilter,
  useRememberedUrlParams,
  useUrlSort,
} from '@/lib/useUrlState';
import { MARKET_WIDE_PAGE_SIZE, topRows } from './marketWidePage';
import { MobileMarketWideList } from './MobileMarketWideList';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { MarketWideFilterBar } from './MarketWideFilterBar';
import {
  BUILD_COST_CAP_ISK,
  MARKET_WIDE_FILTER,
  isKnownRarelySold,
  sameMembers,
  type MarketWideFilterState,
} from './marketWideFilter';
import { commonGateKey, gateKey } from './marketWideSkillGate';
import { useDailySales } from './useDailySales';
import { priceVsMedianFor, usePriceVsMedian } from './usePriceVsMedian';
import { Vs90dFigure } from './Vs90dFigure';
import { vs90dTooltip } from './vs90d';
import { marketWideOpportunitiesCsvColumns } from './opportunitiesCsv';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useHydratedStore } from '@/lib/useHydratedStore';

const ORDER_DEPTH_TONE: Record<OrderDepthLevel, StatChipTone> = {
  deep: 'success',
  moderate: 'default',
  thin: 'warning',
  unknown: 'default',
};

interface MarketWideOpportunitiesPanelProps {
  hub: TradeHub;
  trees: MarketWideTreeMap | null;
  /** The precomputed trees couldn't be loaded (not downloaded yet, no connection). */
  treesFailed?: boolean;
  onRetryTrees?: () => void;
  catalog: BlueprintCatalog | null;
  modifiers: CharacterModifiers;
  /** For the standing toward `hub`'s NPC owner (issue #1238). Null while no character is active. */
  activeCharacterId: number | null;
  /** Resolves true once it has opened the new plan (see `StartPlanButton`). */
  onStartPlan: (entry: BlueprintCatalogEntry) => Promise<boolean>;
  /**
   * The pilot owns blueprints, so Ranked builds is the panel they came for and
   * this one starts folded to its header. Their own choice wins once made.
   */
  startFolded?: boolean;
}

/**
 * The columns' sort keys, at module scope: the columns themselves close over
 * render-time state (and `onStartPlan`, which the parent rebuilds every
 * render), but `DataTable` keys its sort memo on the active `sortValue`, so
 * keeping these stable is what stops a re-render from re-sorting every row.
 */
const SORT_VALUE = {
  product: (row: MarketWideDayRow) => row.productName,
  blueprintSource: (row: MarketWideDayRow) => BLUEPRINT_SOURCE_RANK[row.blueprintSource],
  margin: (row: MarketWideDayRow) => row.marginPct ?? undefined,
  vs90d: (row: MarketWideDayRow) => row.vs90d ?? undefined,
  duration: (row: MarketWideDayRow) => row.seconds,
  iskPerHour: (row: MarketWideDayRow) => row.iskPerHour ?? undefined,
  buildCost: (row: MarketWideDayRow) => row.buildCost,
  orderDepth: (row: MarketWideDayRow) => ORDER_DEPTH_RANK[row.orderDepth],
  iskPerDay: (row: MarketWideDayRow) => row.iskPerDay ?? undefined,
};
const MARKET_WIDE_DEFAULT_SORT = { columnId: 'iskPerHour', direction: 'desc' } as const;

export function MarketWideOpportunitiesPanel({
  hub,
  trees,
  treesFailed = false,
  onRetryTrees,
  catalog,
  modifiers,
  activeCharacterId,
  onStartPlan,
  startFolded = false,
}: MarketWideOpportunitiesPanelProps) {
  const { t } = useTranslation();
  const online = useOnline();
  const unknownName = t('common.unknown');
  // Below `lg` the ranking is cards, the same breakpoint Ranked and All owned switch at.
  const isDesktop = useIsDesktop();
  const tradeHubStandings = useTradeHubStandings(activeCharacterId);
  const standing = tradeHubStanding(tradeHubStandings, hub.id);

  // Account-wide, not active-character: every character on the account, same
  // precedent `OpportunitiesPanel`'s own multi-character fan-out sets. The
  // scan reads the same set for whose blueprints, contracts and LP count.
  const characterNames = useCharacterNames();
  const characterIds = useMemo(() => [...characterNames.keys()], [characterNames]);
  // The share assumption is a remembered default behind its URL key
  // (`salesSharePref.ts`): a link's `marketWide.share` wins, only an edit is stored.
  const rememberedShare = useSalesShare((state) => state.value);
  useHydratedStore(useSalesShare);
  const rememberedParams = useMemo(
    () => ({
      values: { [MARKET_WIDE_FILTER.fieldToParam.salesShare]: rememberedShare },
      remember: (patch: Record<string, unknown>) => {
        const next = patch[MARKET_WIDE_FILTER.fieldToParam.salesShare];
        if (typeof next === 'string') void useSalesShare.getState().setValue(next);
      },
    }),
    [rememberedShare]
  );
  const [params, setParams] = useRememberedUrlParams(MARKET_WIDE_FILTER.schema, rememberedParams);
  const filter = useMemo(
    () => filterFromParamValues<MarketWideFilterState>(params, MARKET_WIDE_FILTER.fieldToParam),
    [params]
  );
  const setFilter = useCallback(
    (next: MarketWideFilterState) =>
      setParams(paramsPatchFromFilter(next, MARKET_WIDE_FILTER.fieldToParam)),
    [setParams]
  );
  const { rows, loading, hasRun, error, fetchedAt, unavailableSources, run } =
    useMarketWideOpportunities({
      hub,
      trees,
      catalog,
      modifiers,
      standing,
      characterIds,
    });
  // A tier, category or source change re-scans (they apply before the top-N
  // cut); the build-cost cap only narrows the rows already ranked.
  const [shownLimit, setShownLimit] = useState(MARKET_WIDE_PAGE_SIZE);
  // `null` until the pilot opens or folds it: then the default (folded once they own blueprints) holds.
  const [expandedChoice, setExpandedChoice] = useState<boolean | null>(null);
  const expanded = expandedChoice ?? !startFolded;
  const scan = (next: MarketWideFilterState) => {
    setShownLimit(MARKET_WIDE_PAGE_SIZE);
    // A scan the pilot asked for shows its results.
    setExpandedChoice(true);
    run(next);
  };
  // `aria-disabled` while offline, not the native attribute, so the reason stays reachable.
  const scanButton = (
    <Button
      size="sm"
      onClick={() => online && trees && catalog && scan(filter)}
      aria-disabled={loading || !online || !trees || !catalog || undefined}
    >
      {loading
        ? t('industry.marketOpportunitiesScanning')
        : t('industry.marketOpportunitiesRunScan')}
    </Button>
  );
  const applyFilter = (next: MarketWideFilterState) => {
    setFilter(next);
    // Any narrowing starts the pilot back at the top of the ranking.
    setShownLimit(MARKET_WIDE_PAGE_SIZE);
    const rescan =
      !sameMembers(next.tiers, filter.tiers) ||
      !sameMembers(next.categories, filter.categories) ||
      !sameMembers(next.sources, filter.sources);
    // Mid-scan too: otherwise the scan already running lands with the old filters.
    if ((hasRun || loading) && rescan && online) scan(next);
  };
  const accountSkills = useAccountSkillLevels(characterIds);

  const skillGateByProductTypeID = useMemo(() => {
    const verdicts = new Map<number, SkillGateVerdict>();
    if (!catalog) return verdicts;
    for (const row of rows) {
      const requirements =
        catalog.byBlueprintTypeID.get(row.blueprintTypeID)?.blueprint.skills ?? [];
      verdicts.set(row.productTypeID, evaluateSkillGate(requirements, accountSkills));
    }
    return verdicts;
  }, [rows, catalog, accountSkills]);

  const commonGate = useMemo(
    () => commonGateKey(skillGateByProductTypeID),
    [skillGateByProductTypeID]
  );

  const hideSkillGated = filter.hideSkillGated;
  const gatedCount = useMemo(
    () => rows.filter((row) => skillGateByProductTypeID.get(row.productTypeID)?.gated).length,
    [rows, skillGateByProductTypeID]
  );
  const maxBuildCostIsk = BUILD_COST_CAP_ISK[filter.maxBuildCost];
  const hideRarelySold = filter.hideRarelySold;
  const rowTypeIds = useMemo(() => rows.map((row) => row.productTypeID), [rows]);
  // Always fetched: ISK/day needs every ranked row's volume, not only the filter's.
  const dailySales = useDailySales(rowTypeIds, hasRun);
  // The scanned hub's region is one of the regions daily sales reads, so
  // this shares those requests through the history cache rather than adding any.
  const vs90dTargets = useMemo(
    () => (hasRun ? rowTypeIds.map((typeId) => ({ hubId: hub.id, typeId })) : []),
    [hasRun, rowTypeIds, hub.id]
  );
  const priceVsMedian = usePriceVsMedian(vs90dTargets);
  const sharePct = Number(filter.salesShare);
  const dayRows = useMemo<MarketWideDayRow[]>(
    () =>
      rows.map((row) => ({
        ...row,
        iskPerDay: iskPerDay({
          unitMargin: row.unitMargin,
          outputQuantity: row.outputQuantity,
          jobSeconds: row.seconds,
          averageDailyVolume: dailySales.sales.get(row.productTypeID),
          sharePct,
        }),
        vs90d: priceVsMedianFor(priceVsMedian, hub.id, row.productTypeID),
      })),
    [rows, dailySales.sales, sharePct, priceVsMedian, hub.id]
  );
  const visibleRows = useMemo(
    () =>
      dayRows.filter(
        (row) =>
          !(hideSkillGated && skillGateByProductTypeID.get(row.productTypeID)?.gated) &&
          (maxBuildCostIsk === null || row.buildCost <= maxBuildCostIsk) &&
          !(hideRarelySold && isKnownRarelySold(dailySales.sales.get(row.productTypeID)))
      ),
    [
      hideSkillGated,
      maxBuildCostIsk,
      hideRarelySold,
      dailySales.sales,
      dayRows,
      skillGateByProductTypeID,
    ]
  );

  const csvColumns = useMemo(() => marketWideOpportunitiesCsvColumns(t), [t]);
  const marketWideExport = useTableExport({
    surface: 'market-wide-opportunities',
    rows: visibleRows,
    columns: csvColumns,
  });

  const startPlanFor = (row: MarketWideResultRow) => {
    const entry = catalog?.byProductTypeID.get(row.productTypeID);
    return entry ? onStartPlan(entry) : Promise.resolve(false);
  };

  const startPlanFromRow = useRowStartPlan(startPlanFor);

  // Mounting `PriceHistoryPanel` is what fetches the item's market history, so
  // it stays out of the tree until a pilot asks for one row's.
  const [historyItem, setHistoryItem] = useState<{ typeId: number; itemName: string } | null>(null);
  // The same item menu Ranked builds rows carry, Price history included.
  const rowContextMenu = (row: MarketWideDayRow, tr: ReactElement) => (
    <ItemContextMenu
      typeId={row.productTypeID}
      itemName={row.productName}
      extraItems={
        <MenuItem
          onSelect={() => setHistoryItem({ typeId: row.productTypeID, itemName: row.productName })}
        >
          {t('industry.opportunitiesPriceHistory')}
        </MenuItem>
      }
    >
      {tr}
    </ItemContextMenu>
  );

  const { visible, isVisible, toggle, reset } = useColumnVisibility(
    useVisibleMarketWideColumns,
    MARKET_WIDE_DEFAULT_COLUMNS
  );

  const columns: DataTableColumn<MarketWideDayRow>[] = [
    {
      id: 'product',
      header: t('industry.product'),
      primary: true,
      sortValue: SORT_VALUE.product,
      render: (row) => {
        const verdict = skillGateByProductTypeID.get(row.productTypeID);
        return (
          <span className="inline-flex items-center gap-1.5">
            {catalog?.byProductTypeID.has(row.productTypeID) ? (
              <span className={entityLinkClassName()}>{row.productName}</span>
            ) : (
              row.productName
            )}
            {!isVisible('blueprintSource') && row.blueprintSource !== 'market' && (
              <span className="text-[0.6875rem] text-text-dim">
                {t(`industry.marketOpportunitiesBlueprintSources.${row.blueprintSource}`)}
              </span>
            )}
            {verdict?.gated && catalog && (
              <SkillGateMarker
                verdict={verdict}
                quiet={commonGate !== null && gateKey(verdict) === commonGate}
                nameForSkill={(typeID) => nameForType(catalog, typeID)}
                nameForCharacter={(id) => characterNames.get(id) ?? t('common.unknown')}
              />
            )}
          </span>
        );
      },
    },
    {
      id: 'blueprintSource',
      header: t('industry.marketOpportunitiesBlueprintSource'),
      sortValue: SORT_VALUE.blueprintSource,
      // The header already names the column, so the cell is just the toned value.
      // The NPC market is nearly every row's source; only an exception is worth a word.
      render: (row) =>
        row.blueprintSource === 'market' ? null : (
          <span
            className={
              STAT_CHIP_TONE_TEXT_CLASS[row.blueprintSource === 'owned' ? 'success' : 'default']
            }
          >
            {t(`industry.marketOpportunitiesBlueprintSources.${row.blueprintSource}`)}
          </span>
        ),
    },
    {
      id: 'margin',
      header: t('industry.margin'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.margin,
      render: (row) => numericCell(row.marginPct, formatPercent, t('common.unknown')),
    },
    {
      id: 'vs90d',
      header: t('industry.vs90d'),
      headerTooltip: vs90dTooltip(t),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.vs90d,
      render: (row) => <Vs90dFigure value={row.vs90d} />,
    },
    {
      // The whole tree's TE-0 job time: ISK/hour's denominator, not a wall-clock promise.
      id: 'duration',
      header: t('industry.time'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.duration,
      render: (row) => formatDuration(row.seconds),
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.iskPerHour,
      cellClassName: (row) => (row.iskPerHour !== null ? iskToneClass(row.iskPerHour) : undefined),
      // Tap, not long press: the ranking's figures are inert — the row's only
      // actions are the button in its last cell and the row's context menu.
      render: (row) =>
        row.iskPerHour === null ? (
          t('common.unknown')
        ) : (
          <span className="inline-flex items-center justify-end gap-1">
            <IskAmount value={row.iskPerHour} decimals={0} />
            {row.priceCapped && (
              <InfoTooltip
                label={t('industry.marketOpportunitiesPriceCapped')}
                content={t('industry.marketOpportunitiesPriceCapped')}
              />
            )}
          </span>
        ),
    },
    {
      id: 'iskPerDay',
      header: t('industry.iskPerDay'),
      headerTooltip: t('industry.iskPerDayTooltip', { share: filter.salesShare }),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.iskPerDay,
      cellClassName: (row) => (row.iskPerDay !== null ? iskToneClass(row.iskPerDay) : undefined),
      render: (row) =>
        row.iskPerDay === null ? (
          // Still reading this product's sales: a blank dash would read as no sales at all.
          dailySales.pending > 0 && !dailySales.sales.has(row.productTypeID) ? (
            <span className="text-text-dim">…</span>
          ) : (
            t('common.unknown')
          )
        ) : (
          <IskAmount value={row.iskPerDay} decimals={0} />
        ),
    },
    {
      id: 'buildCost',
      header: t('industry.buildCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.buildCost,
      render: (row) => <IskAmount value={row.buildCost} decimals={0} />,
    },
    {
      id: 'orderDepth',
      header: t('industry.opportunitiesOrderDepthLabel'),
      sortValue: SORT_VALUE.orderDepth,
      render: (row) => (
        <span className={STAT_CHIP_TONE_TEXT_CLASS[ORDER_DEPTH_TONE[row.orderDepth]]}>
          {t(`industry.opportunitiesOrderDepth.${row.orderDepth}`)}
        </span>
      ),
    },
    {
      id: 'action',
      header: '',
      render: (row) => <StartPlanButton onStart={() => startPlanFor(row)} planKey={row} />,
    },
  ];
  const columnsById = Object.fromEntries(columns.map((column) => [column.id, column])) as Record<
    MarketWideColumnId,
    DataTableColumn<MarketWideDayRow>
  >;
  const shownColumns = columns.filter(
    (column) =>
      !(MARKET_WIDE_COLUMN_IDS as readonly string[]).includes(column.id) ||
      isVisible(column.id as MarketWideColumnId)
  );
  const { sort, onSortChange } = useUrlSort(
    'marketWide.sort',
    MARKET_WIDE_DEFAULT_SORT,
    columns.map((column) => column.id)
  );
  const sortProps = {
    sort,
    onSortChange: (next: typeof sort) => {
      setShownLimit(MARKET_WIDE_PAGE_SIZE);
      onSortChange(next);
    },
  };
  // Cut under the active sort, so a re-sort ranks the whole scan rather than
  // re-ordering whichever 200 the last sort happened to show.
  const shownRows = useMemo(
    () =>
      topRows(
        visibleRows,
        SORT_VALUE[sort.columnId as keyof typeof SORT_VALUE],
        sort.direction,
        shownLimit
      ),
    [visibleRows, sort.columnId, sort.direction, shownLimit]
  );
  const remaining = visibleRows.length - shownRows.length;

  const unavailableNote =
    hasRun && unavailableSources.length > 0 ? (
      <p className="text-[0.6875rem] text-text-dim">
        {t('industry.marketOpportunitiesSourcesUnavailable', {
          sources: unavailableSources
            .map((source) => t(`industry.marketOpportunitiesBlueprintSources.${source}`))
            .join(', '),
        })}
      </p>
    ) : null;

  return (
    <CollapsiblePanel
      title={t('industry.marketOpportunitiesTitle')}
      expanded={expanded}
      onToggle={() => setExpandedChoice(!expanded)}
      labels={{ show: t('industry.showDetails'), hide: t('industry.hideDetails') }}
      meta={
        <InfoTooltip
          label={t('industry.marketOpportunitiesTitle')}
          content={t('industry.marketOpportunitiesLiquidityTooltip')}
        />
      }
      actions={
        <span className="flex items-center gap-2">
          <LiveStatus>
            {hasRun && !loading
              ? error
                ? t('industry.marketOpportunitiesErrorTitle')
                : rows.length === 0
                  ? t('industry.marketOpportunitiesNoResultsTitle')
                  : t('industry.marketOpportunitiesCount', { count: visibleRows.length })
              : null}
          </LiveStatus>
          {hasRun && !loading && !error && fetchedAt && <DataAgeBadge date={fetchedAt} />}
          {hasRun && !loading && visibleRows.length > 0 && (
            <TableActionsMenu
              name={t('industry.marketOpportunitiesTitle')}
              tableExport={marketWideExport}
            />
          )}
          {isDesktop && hasRun && !loading && rows.length > 0 && (
            <ColumnPickerMenu
              available={MARKET_WIDE_COLUMN_IDS}
              visible={visible}
              columnsById={columnsById}
              onToggle={toggle}
              onReset={reset}
              buttonLabel={t('common.columnsButton')}
              menuTitle={t('common.columnsMenuTitle')}
              resetLabel={t('common.resetColumns')}
            />
          )}
          <MarketWideFilterBar filter={filter} onChange={applyFilter} gatedCount={gatedCount} />
          {online ? (
            scanButton
          ) : (
            <Tooltip content={t('common.needsConnection')}>{scanButton}</Tooltip>
          )}
        </span>
      }
    >
      <DataGate
        status={!hasRun && treesFailed && !trees ? 'failed' : 'ok'}
        title={t('industry.marketWideTreesUnavailable')}
        onRetry={onRetryTrees}
        className="py-8"
      >
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner label={t('industry.marketOpportunitiesScanning')} />
          </div>
        ) : error ? (
          <EmptyState
            title={t('industry.marketOpportunitiesErrorTitle')}
            hint={t('industry.marketOpportunitiesErrorHint')}
            action={
              <Button size="sm" onClick={() => scan(filter)}>
                {t('industry.marketOpportunitiesRetry')}
              </Button>
            }
            className="py-8"
          />
        ) : !hasRun ? (
          <EmptyState
            title={t('industry.marketOpportunitiesEmptyTitle')}
            hint={t('industry.marketOpportunitiesEmptyHint')}
            className="py-8"
          />
        ) : rows.length === 0 ? (
          <div className="flex flex-col gap-2">
            <EmptyState
              title={t('industry.marketOpportunitiesNoResultsTitle')}
              hint={t('industry.marketOpportunitiesNoResultsHint')}
              className="py-8"
            />
            {unavailableNote}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {unavailableNote}
            <AssumesBaseStandingsNote hint={t('industry.assumesBaseStandingsHint')} />
            {dailySales.pending > 0 && (
              <p className="text-[0.6875rem] text-text-dim">
                {t('industry.marketOpportunitiesCheckingSales', { count: dailySales.pending })}
              </p>
            )}
            {isDesktop ? (
              <div className="overflow-x-auto">
                <DataTable
                  {...marketWideExport.tableProps}
                  columns={shownColumns}
                  rows={shownRows}
                  rowKey={(row) => row.productTypeID}
                  onRowClick={startPlanFromRow}
                  rowContextMenu={rowContextMenu}
                  rowMoreActions
                  rowClickable={(row) => Boolean(catalog?.byProductTypeID.has(row.productTypeID))}
                  label={t('industry.marketOpportunitiesTitle')}
                  {...sortProps}
                />
              </div>
            ) : (
              <MobileMarketWideList
                rows={shownRows}
                salesShare={filter.salesShare}
                total={visibleRows.length}
                {...sortProps}
                skillGateFor={(productTypeID) => skillGateByProductTypeID.get(productTypeID)}
                nameForSkill={(typeID) => (catalog ? nameForType(catalog, typeID) : unknownName)}
                nameForCharacter={(id) => characterNames.get(id) ?? unknownName}
                onStartPlan={startPlanFor}
              />
            )}
            {remaining > 0 && (
              // A full-width bar under the cards; beside the count with a pointer.
              <div className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center lg:justify-between">
                <p className="text-center text-[0.6875rem] text-text-dim tabular-nums lg:text-left">
                  {t('industry.marketOpportunitiesShowing', {
                    shown: shownRows.length,
                    total: visibleRows.length,
                  })}
                </p>
                {/* `sm` only beside the count with a pointer: alone on a phone it is a thumb target. */}
                <Button
                  size={isDesktop ? 'sm' : undefined}
                  onClick={() => setShownLimit((limit) => limit + MARKET_WIDE_PAGE_SIZE)}
                >
                  {remaining > MARKET_WIDE_PAGE_SIZE
                    ? t('industry.marketOpportunitiesShowNext', { count: MARKET_WIDE_PAGE_SIZE })
                    : t('industry.marketOpportunitiesShowLast', { count: remaining })}
                </Button>
              </div>
            )}
            {gatedCount > 0 && (
              <p className="text-[0.6875rem] text-text-dim">
                {t('industry.marketOpportunitiesSkillGateRule')}
              </p>
            )}
          </div>
        )}
        {historyItem && (
          <Modal
            open
            onClose={() => setHistoryItem(null)}
            title={t('industry.opportunitiesPriceHistoryTitle', { name: historyItem.itemName })}
            placement="wide"
          >
            <PriceHistoryPanel
              regionId={hub.regionId}
              typeId={historyItem.typeId}
              itemName={historyItem.itemName}
            />
          </Modal>
        )}
      </DataGate>
    </CollapsiblePanel>
  );
}
