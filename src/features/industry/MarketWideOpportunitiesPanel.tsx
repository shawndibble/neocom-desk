/**
 * Market-Wide Build Opportunities (issue #819): a second panel on the
 * Opportunities tab, ranking manufacturable products market-wide by
 * ISK/hour, independent of ownership — a cold-start "what should I build,
 * starting from nothing" answer. Opt-in: nothing runs until the pilot hits
 * "Scan".
 */
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  DataTable,
  EmptyState,
  CheckboxSelect,
  FilterBar,
  FilterChip,
  FilterField,
  InfoTooltip,
  IskAmount,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  type DataTableColumn,
  type StatChipTone,
  STAT_CHIP_TONE_TEXT_CLASS,
} from '@/components/ui';
import { db } from '@/db';
import { iskToneClass } from '@/features/character/format';
import { formatDuration } from '@/lib/duration';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { evaluateSkillGate, type SkillGateVerdict } from '@/engine/industry/skillGate';
import {
  BLUEPRINT_SOURCE_RANK,
  BLUEPRINT_SOURCES,
  type BlueprintSource,
} from '@/engine/industry/blueprintObtainability';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_TIERS,
  type ProductCategory,
  type ProductTier,
} from '@/engine/industry/marketWideFilters';
import type { OrderDepthLevel } from '@/engine/industry/opportunities';
import type { MarketWideTreeMap } from '@/sde/types';
import type { TradeHub } from '@/market/hubs';
import { useRowStartPlan } from './rowStartPlan';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import { nameForType, type BlueprintCatalog, type BlueprintCatalogEntry } from './blueprintCatalog';
import type { MarketWideDayRow, MarketWideResultRow } from './marketWideOpportunities';
import { iskPerDay } from '@/engine/industry/iskPerDay';
import { DEFAULT_SALES_SHARE, SALES_SHARE_OPTIONS, useSalesShare } from './salesSharePref';
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
import { boolParam, defineUrlFilter, enumParam, enumSetParam } from '@/lib/urlState';
import { MARKET_WIDE_PAGE_SIZE, topRows } from './marketWidePage';
import { MobileMarketWideList } from './MobileMarketWideList';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { RARELY_SOLD_PER_DAY, isRarelySold } from '@/engine/industry/marketWideSanity';
import { useDailySales } from './useDailySales';
import { marketWideOpportunitiesCsvColumns } from './opportunitiesCsv';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';

const ORDER_DEPTH_TONE: Record<OrderDepthLevel, StatChipTone> = {
  deep: 'success',
  moderate: 'default',
  thin: 'warning',
  unknown: 'default',
};

interface MarketWideOpportunitiesPanelProps {
  hub: TradeHub;
  trees: MarketWideTreeMap | null;
  catalog: BlueprintCatalog | null;
  modifiers: CharacterModifiers;
  /** For the standing toward `hub`'s NPC owner (issue #1238). Null while no character is active. */
  activeCharacterId: number | null;
  /** Resolves true once it has opened the new plan (see `StartPlanButton`). */
  onStartPlan: (entry: BlueprintCatalogEntry) => Promise<boolean>;
}

/** "Max build cost" presets — a budget cap, applied to the ranked rows since cost is only known once priced. */
const BUILD_COST_CAPS = ['any', '10m', '100m', '1b', '10b'] as const;
type BuildCostCap = (typeof BUILD_COST_CAPS)[number];
const BUILD_COST_CAP_ISK: Record<BuildCostCap, number | null> = {
  any: null,
  '10m': 10_000_000,
  '100m': 100_000_000,
  '1b': 1_000_000_000,
  '10b': 10_000_000_000,
};

interface MarketWideFilterState {
  tiers: ReadonlySet<ProductTier>;
  categories: ReadonlySet<ProductCategory>;
  sources: ReadonlySet<BlueprintSource>;
  maxBuildCost: BuildCostCap;
  /** Hides rows no Character on the account has the skills to build. */
  hideSkillGated: boolean;
  /** Hides products selling fewer than `RARELY_SOLD_PER_DAY` a day across the trade-hub regions. */
  hideRarelySold: boolean;
  /** The percent of daily sales ISK/day assumes the pilot sells, as `SALES_SHARE_OPTIONS` text. */
  salesShare: string;
}

const MARKET_WIDE_FILTER = defineUrlFilter<MarketWideFilterState>({
  tiers: { key: 'marketWide.tiers', codec: enumSetParam(PRODUCT_TIERS) },
  categories: { key: 'marketWide.categories', codec: enumSetParam(PRODUCT_CATEGORIES) },
  sources: { key: 'marketWide.sources', codec: enumSetParam(BLUEPRINT_SOURCES) },
  maxBuildCost: { key: 'marketWide.maxCost', codec: enumParam(BUILD_COST_CAPS, 'any') },
  // The key the standalone chip used, so links saved before the move still apply.
  hideSkillGated: { key: 'marketWide.hideGated', codec: boolParam() },
  hideRarelySold: { key: 'marketWide.hideRare', codec: boolParam() },
  salesShare: {
    key: 'marketWide.share',
    codec: enumParam(SALES_SHARE_OPTIONS, DEFAULT_SALES_SHARE),
  },
});

function activeFilterCount(filter: MarketWideFilterState): number {
  return [
    filter.tiers.size !== PRODUCT_TIERS.length,
    filter.categories.size !== PRODUCT_CATEGORIES.length,
    filter.sources.size !== BLUEPRINT_SOURCES.length,
    filter.maxBuildCost !== 'any',
    filter.hideSkillGated,
    filter.hideRarelySold,
    filter.salesShare !== DEFAULT_SALES_SHARE,
  ].filter(Boolean).length;
}

/** Only a product whose sales were read and fall short is hidden; an unreadable one stays. */
function isKnownRarelySold(unitsPerDay: number | null | undefined): boolean {
  return unitsPerDay !== null && unitsPerDay !== undefined && isRarelySold(unitsPerDay);
}

function sameMembers<V>(a: ReadonlySet<V>, b: ReadonlySet<V>): boolean {
  return a.size === b.size && [...a].every((member) => b.has(member));
}

/** `set` with `member` flipped. */
function toggled<V>(set: ReadonlySet<V>, member: V): ReadonlySet<V> {
  const next = new Set(set);
  if (next.has(member)) next.delete(member);
  else next.add(member);
  return next;
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
  catalog,
  modifiers,
  activeCharacterId,
  onStartPlan,
}: MarketWideOpportunitiesPanelProps) {
  const { t } = useTranslation();
  const unknownName = t('common.unknown');
  // Below `lg` the ranking is cards, the same breakpoint Ranked and All owned switch at.
  const isDesktop = useIsDesktop();
  const tradeHubStandings = useTradeHubStandings(activeCharacterId);
  const standing = tradeHubStanding(tradeHubStandings, hub.id);

  // Account-wide, not active-character: every character on the account, same
  // precedent `OpportunitiesPanel`'s own multi-character fan-out sets. The
  // scan reads the same set for whose blueprints, contracts and LP count.
  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
  const characterNames = useMemo(
    () => new Map((allCharacters ?? []).map((c) => [c.characterId, c.name])),
    [allCharacters]
  );
  const characterIds = useMemo(() => [...characterNames.keys()], [characterNames]);
  // The share assumption is a remembered default behind its URL key
  // (`salesSharePref.ts`): a link's `marketWide.share` wins, only an edit is stored.
  const rememberedShare = useSalesShare((state) => state.value);
  const hydrateRememberedShare = useSalesShare((state) => state.hydrate);
  useEffect(() => {
    void hydrateRememberedShare();
  }, [hydrateRememberedShare]);
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
  const { rows, loading, hasRun, unavailableSources, run } = useMarketWideOpportunities({
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
  const scan = (next: MarketWideFilterState) => {
    setShownLimit(MARKET_WIDE_PAGE_SIZE);
    run(next);
  };
  const applyFilter = (next: MarketWideFilterState) => {
    setFilter(next);
    // Any narrowing starts the pilot back at the top of the ranking.
    setShownLimit(MARKET_WIDE_PAGE_SIZE);
    const rescan =
      !sameMembers(next.tiers, filter.tiers) ||
      !sameMembers(next.categories, filter.categories) ||
      !sameMembers(next.sources, filter.sources);
    // Mid-scan too: otherwise the scan already running lands with the old filters.
    if ((hasRun || loading) && rescan) scan(next);
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
      })),
    [rows, dailySales.sales, sharePct]
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
            {verdict?.gated && catalog && (
              <SkillGateMarker
                verdict={verdict}
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
      render: (row) => (
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
          t('common.unknown')
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

  // The funnel sits in the title bar beside Scan, at Scan's own size, in every
  // state: below `md` it opens `FilterBar`'s sheet, with a pointer a popover
  // off the funnel — a box unfolding beneath it would open inside the bar.
  const filterBar = (
    <FilterBar
      value={filter}
      onChange={applyFilter}
      activeCount={activeFilterCount(filter)}
      triggerSize="sm"
      pointerSurface="popover"
    >
      {(draft, setDraft) => (
        <>
          <FilterField label={t('industry.marketOpportunitiesFilters.maxBuildCost')}>
            <Select
              value={draft.maxBuildCost}
              onValueChange={(value) => setDraft({ ...draft, maxBuildCost: value as BuildCostCap })}
            >
              <SelectTrigger
                size="sm"
                aria-label={t('industry.marketOpportunitiesFilters.maxBuildCost')}
                className="w-52"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUILD_COST_CAPS.map((cap) => (
                  <SelectItem key={cap} value={cap}>
                    {t(`industry.marketOpportunitiesFilters.buildCostCaps.${cap}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <FilterMultiSelect
            label={t('industry.marketOpportunitiesFilters.tier')}
            members={PRODUCT_TIERS}
            selected={draft.tiers}
            labelFor={(tier) => t(`industry.marketOpportunitiesFilters.tiers.${tier}`)}
            onToggle={(tier) => setDraft({ ...draft, tiers: toggled(draft.tiers, tier) })}
          />
          <FilterMultiSelect
            label={t('industry.marketOpportunitiesFilters.category')}
            members={PRODUCT_CATEGORIES}
            selected={draft.categories}
            labelFor={(category) => t(`industry.marketOpportunitiesFilters.categories.${category}`)}
            onToggle={(category) =>
              setDraft({ ...draft, categories: toggled(draft.categories, category) })
            }
          />
          <FilterMultiSelect
            label={t('industry.marketOpportunitiesBlueprintSource')}
            members={BLUEPRINT_SOURCES}
            selected={draft.sources}
            labelFor={(source) => t(`industry.marketOpportunitiesBlueprintSources.${source}`)}
            onToggle={(source) => setDraft({ ...draft, sources: toggled(draft.sources, source) })}
          />
          <div
            role="group"
            aria-label={t('industry.marketOpportunitiesFilters.skills')}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-text-dim">{t('industry.marketOpportunitiesFilters.skills')}</span>
            <FilterChip
              label={t('industry.skillGateFilterChip')}
              selected={draft.hideSkillGated}
              onToggle={() => setDraft({ ...draft, hideSkillGated: !draft.hideSkillGated })}
              {...(gatedCount > 0 && {
                count: gatedCount,
                countLabel: t('industry.skillGateFilterChipCount', { count: gatedCount }),
              })}
            />
          </div>
          <FilterField label={t('industry.marketOpportunitiesFilters.salesShare')}>
            <Select
              value={draft.salesShare}
              onValueChange={(value) => setDraft({ ...draft, salesShare: value })}
            >
              <SelectTrigger
                size="sm"
                aria-label={t('industry.marketOpportunitiesFilters.salesShare')}
                className="w-52"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SALES_SHARE_OPTIONS.map((share) => (
                  <SelectItem key={share} value={share}>
                    {t('industry.marketOpportunitiesFilters.salesShareOption', { share })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterField>
          <div
            role="group"
            aria-label={t('industry.marketOpportunitiesFilters.sales')}
            className="flex flex-wrap items-center gap-2"
          >
            <span className="text-text-dim">{t('industry.marketOpportunitiesFilters.sales')}</span>
            <FilterChip
              label={t('industry.marketOpportunitiesFilters.hideRarelySold', {
                limit: RARELY_SOLD_PER_DAY,
              })}
              selected={draft.hideRarelySold}
              onToggle={() => setDraft({ ...draft, hideRarelySold: !draft.hideRarelySold })}
            />
          </div>
        </>
      )}
    </FilterBar>
  );

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
    <Panel
      title={t('industry.marketOpportunitiesTitle')}
      meta={
        <InfoTooltip
          label={t('industry.marketOpportunitiesTitle')}
          content={t('industry.marketOpportunitiesLiquidityTooltip')}
        />
      }
      actions={
        <span className="flex items-center gap-2">
          {hasRun && !loading && visibleRows.length > 0 && (
            <TableActionsMenu
              name={t('industry.marketOpportunitiesTitle')}
              tableExport={marketWideExport}
            />
          )}
          {filterBar}
          <Button size="sm" onClick={() => scan(filter)} disabled={loading || !trees || !catalog}>
            {loading
              ? t('industry.marketOpportunitiesScanning')
              : t('industry.marketOpportunitiesRunScan')}
          </Button>
        </span>
      }
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('industry.marketOpportunitiesScanning')} />
        </div>
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
                columns={columns}
                rows={shownRows}
                rowKey={(row) => row.productTypeID}
                onRowClick={startPlanFromRow}
                rowClickable={(row) => Boolean(catalog?.byProductTypeID.has(row.productTypeID))}
                label={t('industry.marketOpportunitiesTitle')}
                {...sortProps}
              />
            </div>
          ) : (
            <MobileMarketWideList
              rows={shownRows}
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
    </Panel>
  );
}

/** One labelled multi-select dropdown over a closed set — BPC Sourcing's filter groups, reused. */
function FilterMultiSelect<V extends string>({
  label,
  members,
  selected,
  labelFor,
  onToggle,
}: {
  label: string;
  members: readonly V[];
  selected: ReadonlySet<V>;
  labelFor: (member: V) => string;
  onToggle: (member: V) => void;
}) {
  return (
    <FilterField label={label}>
      <CheckboxSelect
        label={label}
        className="w-44"
        options={members.map((member) => ({ value: member, label: labelFor(member) }))}
        selected={selected}
        onToggle={onToggle}
      />
    </FilterField>
  );
}
