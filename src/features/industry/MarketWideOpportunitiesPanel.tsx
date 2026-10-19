/**
 * Market-Wide Build Opportunities (issue #819): a second panel on the
 * Opportunities tab, ranking manufacturable products market-wide by
 * ISK/hour, independent of ownership — a cold-start "what should I build,
 * starting from nothing" answer. Opt-in: nothing runs until the pilot hits
 * "Scan".
 */
import { useMemo, useState, type ReactElement } from 'react';
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
  MenuItem,
  Modal,
  LiveStatus,
  Spinner,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { DataGate } from '@/components/DataGate';
import { useOnline } from '@/stores/network';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { PriceHistoryPanel } from '@/features/market/PriceHistoryPanel';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import type { MarketWideTreeMap } from '@/sde/types';
import type { TradeHub } from '@/market/hubs';
import {
  MARKET_WIDE_COLUMN_IDS,
  MARKET_WIDE_DEFAULT_COLUMNS,
  useVisibleMarketWideColumns,
  type MarketWideColumnId,
} from './marketWideColumns';
import { useRowStartPlan } from './rowStartPlan';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import { nameForType, type BlueprintCatalog, type BlueprintCatalogEntry } from './blueprintCatalog';
import type { MarketWideDayRow, MarketWideResultRow } from './marketWideOpportunities';
import { useMarketWideOpportunities } from './useMarketWideOpportunities';
import { useUrlSort } from '@/lib/useUrlState';
import { MARKET_WIDE_PAGE_SIZE, topRows } from './marketWidePage';
import { MobileMarketWideList } from './MobileMarketWideList';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { MarketWideFilterBar } from './MarketWideFilterBar';
import { sameMembers, type MarketWideFilterState } from './marketWideFilter';
import { marketWideOpportunitiesCsvColumns } from './opportunitiesCsv';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { SORT_VALUE, useMarketWideColumns } from './useMarketWideColumns';
import { useMarketWideFilter } from './useMarketWideFilter';
import { useMarketWideRanking } from './useMarketWideRanking';

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
  const { filter, setFilter } = useMarketWideFilter();
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
  const { skillGateByProductTypeID, commonGate, gatedCount, dailySales, visibleRows } =
    useMarketWideRanking({ rows, hasRun, hub, catalog, characterIds, filter });

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

  const columns = useMarketWideColumns({
    catalog,
    characterNames,
    salesShare: filter.salesShare,
    dailySales,
    skillGateByProductTypeID,
    commonGate,
    isVisible,
    startPlanFor,
  });
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
