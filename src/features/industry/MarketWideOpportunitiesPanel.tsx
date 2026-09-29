/**
 * Market-Wide Build Opportunities (issue #819): a second panel on the
 * Opportunities tab, ranking manufacturable products market-wide by
 * ISK/hour, independent of ownership — a cold-start "what should I build,
 * starting from nothing" answer. Opt-in: nothing runs until the pilot hits
 * "Scan".
 */
import { useMemo, type ReactElement } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  DataTable,
  EmptyState,
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
  StatChip,
  type DataTableColumn,
  type StatChipTone,
} from '@/components/ui';
import { db } from '@/db';
import { iskToneClass } from '@/features/character/format';
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
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import { nameForType, type BlueprintCatalog, type BlueprintCatalogEntry } from './blueprintCatalog';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { useMarketWideOpportunities } from './useMarketWideOpportunities';
import { SkillGateMarker } from './SkillGateMarker';
import { ORDER_DEPTH_RANK } from './opportunityMetrics';
import { StartPlanButton } from './StartPlanButton';
import { useUrlFilter, useUrlSort } from '@/lib/useUrlState';
import { boolParam, defineUrlFilter, enumParam, enumSetParam } from '@/lib/urlState';
import { useIsPhone } from '@/lib/useIsPhone';
import { RARELY_SOLD_PER_DAY, isRarelySold } from '@/engine/industry/marketWideSanity';
import { useDailySales } from './useDailySales';

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
}

const MARKET_WIDE_FILTER = defineUrlFilter<MarketWideFilterState>({
  tiers: { key: 'marketWide.tiers', codec: enumSetParam(PRODUCT_TIERS) },
  categories: { key: 'marketWide.categories', codec: enumSetParam(PRODUCT_CATEGORIES) },
  sources: { key: 'marketWide.sources', codec: enumSetParam(BLUEPRINT_SOURCES) },
  maxBuildCost: { key: 'marketWide.maxCost', codec: enumParam(BUILD_COST_CAPS, 'any') },
  // The key the standalone chip used, so links saved before the move still apply.
  hideSkillGated: { key: 'marketWide.hideGated', codec: boolParam() },
  hideRarelySold: { key: 'marketWide.hideRare', codec: boolParam() },
});

function activeFilterCount(filter: MarketWideFilterState): number {
  return [
    filter.tiers.size !== PRODUCT_TIERS.length,
    filter.categories.size !== PRODUCT_CATEGORIES.length,
    filter.sources.size !== BLUEPRINT_SOURCES.length,
    filter.maxBuildCost !== 'any',
    filter.hideSkillGated,
    filter.hideRarelySold,
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
  product: (row: MarketWideResultRow) => row.productName,
  blueprintSource: (row: MarketWideResultRow) => BLUEPRINT_SOURCE_RANK[row.blueprintSource],
  iskPerHour: (row: MarketWideResultRow) => row.iskPerHour ?? undefined,
  buildCost: (row: MarketWideResultRow) => row.buildCost,
  orderDepth: (row: MarketWideResultRow) => ORDER_DEPTH_RANK[row.orderDepth],
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
  const isPhone = useIsPhone();
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
  const [filter, setFilter] = useUrlFilter<MarketWideFilterState>(
    '',
    MARKET_WIDE_FILTER.schema,
    MARKET_WIDE_FILTER.fieldToParam,
    MARKET_WIDE_FILTER.emptyParams
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
  const applyFilter = (next: MarketWideFilterState) => {
    setFilter(next);
    const rescan =
      !sameMembers(next.tiers, filter.tiers) ||
      !sameMembers(next.categories, filter.categories) ||
      !sameMembers(next.sources, filter.sources);
    // Mid-scan too: otherwise the scan already running lands with the old filters.
    if ((hasRun || loading) && rescan) run(next);
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
  const dailySales = useDailySales(rowTypeIds, hideRarelySold);
  const visibleRows = useMemo(
    () =>
      rows.filter(
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
      rows,
      skillGateByProductTypeID,
    ]
  );

  const columns: DataTableColumn<MarketWideResultRow>[] = [
    {
      id: 'product',
      header: t('industry.product'),
      primary: true,
      sortValue: SORT_VALUE.product,
      render: (row) => {
        const verdict = skillGateByProductTypeID.get(row.productTypeID);
        return (
          <span className="inline-flex items-center gap-1.5">
            <MarketItemLink typeId={row.productTypeID}>{row.productName}</MarketItemLink>
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
      render: (row) => (
        <StatChip
          label={t('industry.marketOpportunitiesBlueprintSource')}
          value={t(`industry.marketOpportunitiesBlueprintSources.${row.blueprintSource}`)}
          tone={row.blueprintSource === 'owned' ? 'success' : 'default'}
        />
      ),
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
            <IskAmount value={row.iskPerHour} revealOn="tap" decimals={0} />
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
      id: 'buildCost',
      header: t('industry.buildCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.buildCost,
      render: (row) => <IskAmount value={row.buildCost} revealOn="tap" decimals={0} />,
    },
    {
      id: 'orderDepth',
      header: t('industry.opportunitiesOrderDepthLabel'),
      sortValue: SORT_VALUE.orderDepth,
      render: (row) => (
        <StatChip
          label={t('industry.opportunitiesOrderDepthLabel')}
          value={t(`industry.opportunitiesOrderDepth.${row.orderDepth}`)}
          tone={ORDER_DEPTH_TONE[row.orderDepth]}
        />
      ),
    },
    {
      id: 'action',
      header: '',
      render: (row) => (
        <StartPlanButton
          onStart={() => {
            const entry = catalog?.byProductTypeID.get(row.productTypeID);
            return entry ? onStartPlan(entry) : Promise.resolve(false);
          }}
        />
      ),
    },
  ];
  const rowContextMenu = (row: MarketWideResultRow, tr: ReactElement): ReactElement => (
    <ItemContextMenu
      typeId={row.productTypeID}
      itemName={row.productName}
      blueprintTypeID={
        catalog
          ? (catalog.byProductTypeID.get(row.productTypeID)?.blueprintTypeID ?? null)
          : undefined
      }
    >
      {tr}
    </ItemContextMenu>
  );
  const sortProps = useUrlSort(
    'marketWide.sort',
    MARKET_WIDE_DEFAULT_SORT,
    columns.map((column) => column.id)
  );

  // On a phone with results, the funnel sits beside the table's sort picker
  // rather than on a row of its own above it.
  const filtersInSortBar = isPhone && hasRun && !loading && rows.length > 0;
  const filterBar = (
    <FilterBar
      value={filter}
      onChange={applyFilter}
      activeCount={activeFilterCount(filter)}
      className={filtersInSortBar ? undefined : 'mb-2'}
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
          <ChipGroup
            label={t('industry.marketOpportunitiesFilters.tier')}
            members={PRODUCT_TIERS}
            selected={draft.tiers}
            labelFor={(tier) => t(`industry.marketOpportunitiesFilters.tiers.${tier}`)}
            onToggle={(tier) => setDraft({ ...draft, tiers: toggled(draft.tiers, tier) })}
          />
          <ChipGroup
            label={t('industry.marketOpportunitiesFilters.category')}
            members={PRODUCT_CATEGORIES}
            selected={draft.categories}
            labelFor={(category) => t(`industry.marketOpportunitiesFilters.categories.${category}`)}
            onToggle={(category) =>
              setDraft({ ...draft, categories: toggled(draft.categories, category) })
            }
          />
          <ChipGroup
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
        <Button size="sm" onClick={() => run(filter)} disabled={loading || !trees || !catalog}>
          {loading
            ? t('industry.marketOpportunitiesScanning')
            : t('industry.marketOpportunitiesRunScan')}
        </Button>
      }
    >
      {!filtersInSortBar && filterBar}
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
          {hideRarelySold && dailySales.pending > 0 && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('industry.marketOpportunitiesCheckingSales', { count: dailySales.pending })}
            </p>
          )}
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              rows={visibleRows}
              rowKey={(row) => row.productTypeID}
              rowContextMenu={rowContextMenu}
              rowMoreActions
              label={t('industry.marketOpportunitiesTitle')}
              mobileSort
              stackActions={filtersInSortBar ? filterBar : undefined}
              {...sortProps}
            />
          </div>
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

/** One labelled row of on/off chips over a closed set — BPC Sourcing's filter groups, reused. */
function ChipGroup<V extends string>({
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
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="text-text-dim">{label}</span>
      {members.map((member) => (
        <FilterChip
          key={member}
          label={labelFor(member)}
          selected={selected.has(member)}
          onToggle={() => onToggle(member)}
        />
      ))}
    </div>
  );
}
