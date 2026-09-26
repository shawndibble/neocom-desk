import { lazy, Suspense, useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  db,
  type BuildPlanRecord,
  type ProductionOrderWatchRecord,
  type ProductionRunRecord,
  type ProductionSaleLinkRecord,
} from '@/db';
import {
  CollapsiblePanel,
  DataTable,
  EmptyState,
  FilterBar,
  Panel,
  Spinner,
  TextInput,
  useFilterSurface,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { cx } from '@/lib/cx';
import { soldUnitsMargin } from '@/engine/industry/realizedProfit';
import type { SkillLevels } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import { getTradeHub, DEFAULT_TRADE_HUB } from '@/market/hubs';
import { ItemContextMenu, ItemMoreActions } from '@/features/market/ItemContextMenu';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import type { BlueprintCatalog } from './blueprintCatalog';
import {
  activeProductionLogFilterCount,
  filterProductionRunsByDate,
  type ProductionLogFilter,
} from './productionLogFilter';
import { productionProfitHistory, productionProfitTrend } from './productionProfitHistory';
import { summarizeProductionRun, type ProductionRunSummary } from './productionRunSummary';
import {
  loggedAtColumn,
  quantityColumn,
  quantitySoldColumn,
  realizedProfitColumn,
  soldActionsColumn,
  statusColumn,
  totalCostColumn,
} from './productionRunColumns';
import { SaleLinkingModals } from './SaleLinkingControls';
import { useSaleLinking } from './useSaleLinking';
import { iskToneClass } from '@/features/character/format';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { formatIsk } from '@/lib/isk';
import { useTimeZone } from '@/lib/timeFormat';
import { formatPercent } from './format';
import { useUrlParam, useUrlParams } from '@/lib/useUrlState';
import { isoDateParam, optionalSortParam, type UrlSort } from '@/lib/urlState';

/**
 * Dynamic import, not a static one: `ProductionProfitChart.tsx` statically
 * imports Recharts, so this is the boundary that keeps the library out of
 * the initial page bundle — it only loads once the Records tab actually
 * renders a chart (see `character/WalletBalanceChart.tsx`'s bundle-size
 * precedent).
 */
const LazyProductionProfitChart = lazy(() => import('./ProductionProfitChart'));

interface ProductionLogPanelProps {
  characterId: number;
  catalog: BlueprintCatalog;
  skills: SkillLevels;
  plans: BuildPlanRecord[];
  /** Row click on the runs table: hands back the run's own Build Plan so the caller can jump to it. */
  onOpenRun?: (buildPlanId: string) => void;
  onAddToQuickbar: (typeId: number, itemName: string) => void;
  /** False with no active character — the Quickbar has nobody to save the item under. */
  quickbarAvailable: boolean;
  onShowInfo: (typeId: number, itemName: string) => void;
}

interface ItemRow {
  productTypeID: number;
  itemName: string;
  runsLogged: number;
  unitsProduced: number;
  unitsSold: number;
  realizedProfit: number;
  revenue: number;
  /** Null when nothing has sold for this item yet — a percentage of zero revenue is not a number. */
  avgMarginPct: number | null;
  /** Net revenue less the sold units' share of cost (issue #1785). */
  soldUnitsMargin: number;
  unsoldCost: number;
}

// Stable empty fallbacks for `useLiveQuery(...) ?? []`: a fresh `[]` literal
// on every render defeats `useMemo`'s dependency check below during the one
// or two renders before the live query first resolves — these are read-only
// and module-level, so they never change identity.
const NO_RUNS: ProductionRunRecord[] = [];

/** The date range in the URL (ADR 0015); both ends open by default. */
const DATE_RANGE_PARAMS = { 'records.from': isoDateParam(), 'records.to': isoDateParam() };
/** Both tables start unsorted, in the order the rollup builds them. */
const TABLE_SORT = optionalSortParam();

/** A URL sort naming a column this table does not have reads as unsorted. */
function knownSort(sort: UrlSort | null, columns: readonly { id: string }[]): UrlSort | null {
  return sort !== null && columns.some((column) => column.id === sort.columnId) ? sort : null;
}
const NO_SALE_LINKS: ProductionSaleLinkRecord[] = [];
const NO_ORDER_WATCHES: ProductionOrderWatchRecord[] = [];

/** Every row this run's own id backs, grouped once instead of `.filter()`-ed once per run. */
function groupByRunId<T extends { runId: string }>(rows: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const existing = map.get(row.runId);
    if (existing) existing.push(row);
    else map.set(row.runId, [row]);
  }
  return map;
}

/** One label-over-value block, matching the design's larger dashboard stat (distinct from the compact `StatChip`). */
/** One ledger line of the Records rollup: uppercase label left, figure right. */
function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 text-[0.6875rem]">
      <span className="font-semibold tracking-widest text-text-dim uppercase">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/**
 * The Records tab's From/To pair — copies `Wallet.tsx`'s `JournalDateRange`
 * layout exactly (a visible `<label>` rather than `FilterField`, so the
 * caption shows inline as well as in the mobile sheet) since this is the same
 * shape of control: two `date` inputs bounding one collection by a stored
 * timestamp.
 */
function ProductionLogDateRange({
  draft,
  setDraft,
}: {
  draft: ProductionLogFilter;
  setDraft: (next: ProductionLogFilter) => void;
}) {
  const { t } = useTranslation();
  const sheet = useFilterSurface() === 'sheet';
  const labelClassName = cx(
    'flex items-center gap-1 text-xs text-text-dim',
    sheet && 'min-w-0 flex-1'
  );
  const fieldClassName = sheet ? 'w-full min-w-0' : 'w-36';
  return (
    <div className={sheet ? 'flex w-full items-center gap-2' : 'contents'}>
      <label className={labelClassName}>
        {t('industry.dateFromLabel')}
        <TextInput
          type="date"
          className={fieldClassName}
          value={draft.startDate ?? ''}
          onChange={(event) =>
            setDraft({ ...draft, startDate: event.target.value === '' ? null : event.target.value })
          }
        />
      </label>
      <label className={labelClassName}>
        {t('industry.dateToLabel')}
        <TextInput
          type="date"
          className={fieldClassName}
          value={draft.endDate ?? ''}
          onChange={(event) =>
            setDraft({ ...draft, endDate: event.target.value === '' ? null : event.target.value })
          }
        />
      </label>
    </div>
  );
}

interface RunRow extends ProductionRunSummary {
  itemName: string;
  /** Whether the run's own Build Plan still exists — a run outlives a deleted plan (locked financial record), so this gates the row-click navigation rather than a display column. */
  planExists: boolean;
}

interface Rollup {
  summaries: ProductionRunSummary[];
  itemRows: ItemRow[];
  runRows: RunRow[];
  filteredRunCount: number;
  totalRealizedProfit: number;
  totalCostLogged: number;
  totalRevenueLinked: number;
  openInventoryValue: number;
  /** Realized profit over linked revenue, weighted — null until a sale is linked. */
  avgMarginPct: number | null;
}

function buildRollup(
  runs: readonly ProductionRunRecord[],
  saleLinks: readonly ProductionSaleLinkRecord[],
  orderWatches: readonly ProductionOrderWatchRecord[],
  filter: ProductionLogFilter,
  skills: SkillLevels,
  catalog: BlueprintCatalog,
  planIds: ReadonlySet<string>,
  /** Each run's own Build Plan's Trade Hub standing (issue #1238), keyed by `run.buildPlanId` — see `standingByPlanId` below. */
  standingByPlanId: ReadonlyMap<string, ResolvedStandings>
): Rollup {
  const filteredRuns = filterProductionRunsByDate(runs, filter);
  const saleLinksByRun = groupByRunId(saleLinks);
  const orderWatchesByRun = groupByRunId(orderWatches);
  const summaries = filteredRuns.map((run) =>
    summarizeProductionRun(
      run,
      saleLinksByRun.get(run.id) ?? [],
      orderWatchesByRun.get(run.id) ?? [],
      skills,
      standingByPlanId.get(run.buildPlanId)
    )
  );

  const byItem = new Map<number, ItemRow>();
  for (const s of summaries) {
    const typeID = s.run.productTypeID;
    const existing = byItem.get(typeID);
    const sold = soldUnitsMargin({
      totalCost: s.run.totalCost,
      quantity: s.run.quantity,
      quantitySold: s.quantitySold,
      netRevenue: s.profit.netRevenue,
    });
    if (existing) {
      existing.runsLogged += 1;
      existing.unitsProduced += s.run.quantity;
      existing.unitsSold += s.quantitySold;
      existing.realizedProfit += s.profit.profit;
      existing.revenue += s.profit.grossRevenue;
      existing.soldUnitsMargin += sold.margin;
      existing.unsoldCost += sold.unsoldCost;
    } else {
      byItem.set(typeID, {
        productTypeID: typeID,
        itemName: catalog.byProductTypeID.get(typeID)?.productName ?? `#${typeID}`,
        runsLogged: 1,
        unitsProduced: s.run.quantity,
        unitsSold: s.quantitySold,
        realizedProfit: s.profit.profit,
        revenue: s.profit.grossRevenue,
        avgMarginPct: null,
        soldUnitsMargin: sold.margin,
        unsoldCost: sold.unsoldCost,
      });
    }
  }
  // Margin is computed per item over its combined revenue, not averaged from
  // the per-run percentages — a weighted rollup, the same reasoning
  // `realizedProfit`'s own marginPct uses per run.
  const itemRows = Array.from(byItem.values()).map((row) => ({
    ...row,
    avgMarginPct: row.revenue > 0 ? (row.realizedProfit / row.revenue) * 100 : null,
  }));

  const runRows: RunRow[] = summaries
    .map((summary) => ({
      ...summary,
      itemName:
        catalog.byProductTypeID.get(summary.run.productTypeID)?.productName ??
        `#${summary.run.productTypeID}`,
      planExists: planIds.has(summary.run.buildPlanId),
    }))
    .sort((a, b) => b.run.loggedAt - a.run.loggedAt);

  const totalRealizedProfit = summaries.reduce((sum, s) => sum + s.profit.profit, 0);
  const totalRevenueLinked = summaries.reduce((sum, s) => sum + s.profit.grossRevenue, 0);
  return {
    summaries,
    itemRows,
    runRows,
    filteredRunCount: filteredRuns.length,
    totalRealizedProfit,
    totalCostLogged: summaries.reduce((sum, s) => sum + s.run.totalCost, 0),
    totalRevenueLinked,
    openInventoryValue: summaries.reduce((sum, s) => sum + s.openInventoryValue, 0),
    avgMarginPct: totalRevenueLinked > 0 ? (totalRealizedProfit / totalRevenueLinked) * 100 : null,
  };
}

/**
 * Cross-plan, cross-item realized-profit rollup (issue #525) — the aggregate
 * "Production Log" the original design mockup's final step showed. Distinct
 * from `ProductionRunsPanel`, which is scoped to one Build Plan's own runs:
 * this reads every Production Run the character has logged, grouped by
 * product, regardless of which plan it came from. Rendered as the Industry
 * route's "Records" tab (a peer of the Build Plan list/detail grid, per
 * `Tabs`' own "peer views within a page" contract) rather than the mockup's
 * undecided-at-the-time "own panel vs. dedicated route" choice — a tab needed
 * neither.
 */
export function ProductionLogPanel({
  characterId,
  catalog,
  skills,
  plans,
  onOpenRun,
  onAddToQuickbar,
  quickbarAvailable,
  onShowInfo,
}: ProductionLogPanelProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const [dateRange, setDateRange] = useUrlParams(DATE_RANGE_PARAMS);
  const filter: ProductionLogFilter = useMemo(
    () => ({ startDate: dateRange['records.from'], endDate: dateRange['records.to'] }),
    [dateRange]
  );
  const setFilter = (next: ProductionLogFilter) =>
    setDateRange({ 'records.from': next.startDate, 'records.to': next.endDate });
  const [itemSort, setItemSort] = useUrlParam('records.itemSort', TABLE_SORT);
  const [runSort, setRunSort] = useUrlParam('records.runSort', TABLE_SORT);
  // The per-run ledger folds away by default: "By item" is the read that
  // says what is making money, the run list is the audit trail behind it.
  const [runsExpanded, setRunsExpanded] = useState(false);

  const runs =
    useLiveQuery(
      () => db.productionRuns.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? NO_RUNS;
  const saleLinks =
    useLiveQuery(
      () => db.productionSaleLinks.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? NO_SALE_LINKS;
  const orderWatches =
    useLiveQuery(
      () => db.productionOrderWatches.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? NO_ORDER_WATCHES;

  const sale = useSaleLinking(characterId, saleLinks, orderWatches);

  const planIds = useMemo(() => new Set(plans.map((p) => p.id)), [plans]);

  // Every Trade Hub's standing for this character (issue #1238), resolved
  // once — each run below reads its own plan's hub out of this map rather
  // than the panel fetching per-plan.
  const tradeHubStandings = useTradeHubStandings(characterId);
  const standingByPlanId = useMemo(() => {
    const map = new Map<string, ResolvedStandings>();
    for (const plan of plans) {
      const hub = getTradeHub(plan.hubId) ?? DEFAULT_TRADE_HUB;
      map.set(plan.id, tradeHubStanding(tradeHubStandings, hub.id));
    }
    return map;
  }, [plans, tradeHubStandings]);

  // The character's full history recomputes here, not on every keystroke in
  // the date filter or unrelated parent re-render — `filter` is the only
  // piece of this that changes often, and everything else it's paired with
  // (`runs`/`saleLinks`/`orderWatches`) only changes on an actual Dexie write.
  const rollup = useMemo(
    () =>
      buildRollup(
        runs,
        saleLinks,
        orderWatches,
        filter,
        skills,
        catalog,
        planIds,
        standingByPlanId
      ),
    [runs, saleLinks, orderWatches, filter, skills, catalog, planIds, standingByPlanId]
  );

  const profitHistoryPoints = useMemo(
    () =>
      productionProfitHistory(
        rollup.summaries.map((s) => ({ loggedAt: s.run.loggedAt, profit: s.profit.profit }))
      ),
    [rollup.summaries]
  );
  const profitHistoryTrend = useMemo(
    () => productionProfitTrend(profitHistoryPoints),
    [profitHistoryPoints]
  );

  if (runs.length === 0) {
    return (
      <Panel title={t('industry.productionLog')}>
        <EmptyState
          title={t('industry.productionLogEmptyTitle')}
          hint={t('industry.productionLogEmptyHint')}
          className="py-6"
        />
      </Panel>
    );
  }

  const {
    summaries,
    itemRows,
    runRows,
    filteredRunCount,
    totalRealizedProfit,
    totalCostLogged,
    totalRevenueLinked,
    openInventoryValue,
    avgMarginPct,
  } = rollup;

  // A product the catalog doesn't know (name fell back to `#<typeID>`) has no
  // menu to offer: the row renders bare rather than opening one titled "#123".
  const itemMenuFor = (typeId: number, itemName: string, tr: ReactElement): ReactElement => {
    const entry = catalog.byProductTypeID.get(typeId);
    return entry ? (
      <ItemContextMenu
        typeId={typeId}
        itemName={itemName}
        blueprintTypeID={entry.blueprintTypeID}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
      >
        {tr}
      </ItemContextMenu>
    ) : (
      tr
    );
  };

  // Visible keyboard-reachable equivalent of `itemMenuFor` above (WCAG 2.1.1,
  // issue #1498) — same conditional: a product the catalog doesn't know gets
  // no button at all, matching the bare row the context menu already leaves it.
  const moreActionsFor = (typeId: number, itemName: string): ReactElement | null => {
    const entry = catalog.byProductTypeID.get(typeId);
    if (!entry) return null;
    return (
      <ItemMoreActions
        typeId={typeId}
        itemName={itemName}
        blueprintTypeID={entry.blueprintTypeID}
        onAddToQuickbar={onAddToQuickbar}
        quickbarAvailable={quickbarAvailable}
        onShowInfo={onShowInfo}
      />
    );
  };

  const columns: DataTableColumn<ItemRow>[] = [
    {
      id: 'item',
      header: t('industry.product'),
      primary: true,
      sortValue: (r) => r.itemName,
      render: (r) => r.itemName,
    },
    {
      id: 'runsLogged',
      header: t('industry.runsLogged'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.runsLogged,
      render: (r) => r.runsLogged.toLocaleString(),
    },
    {
      id: 'unitsProduced',
      header: t('industry.unitsProduced'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.unitsProduced,
      render: (r) => r.unitsProduced.toLocaleString(),
    },
    {
      id: 'unitsSold',
      header: t('industry.unitsSold'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.unitsSold,
      render: (r) => r.unitsSold.toLocaleString(),
    },
    {
      id: 'realizedProfit',
      header: t('industry.realizedProfit'),
      align: 'right',
      className: 'tabular-nums font-semibold',
      cellClassName: (r) => iskToneClass(r.realizedProfit),
      sortValue: (r) => r.realizedProfit,
      render: (r) => formatIsk(r.realizedProfit),
    },
    {
      id: 'avgMargin',
      header: t('industry.avgMargin'),
      align: 'right',
      className: 'tabular-nums text-text-dim',
      sortValue: (r) => r.avgMarginPct ?? undefined,
      render: (r) => (r.avgMarginPct === null ? '—' : formatPercent(r.avgMarginPct)),
    },
    {
      id: 'soldUnitsMargin',
      header: t('industry.soldUnitsMargin'),
      align: 'right',
      className: 'tabular-nums',
      cellClassName: (r) => (r.unitsSold > 0 ? iskToneClass(r.soldUnitsMargin) : 'text-text-dim'),
      sortValue: (r) => (r.unitsSold > 0 ? r.soldUnitsMargin : undefined),
      render: (r) => (r.unitsSold > 0 ? formatIsk(r.soldUnitsMargin) : '—'),
    },
    {
      id: 'unsoldCost',
      header: t('industry.unsoldCost'),
      align: 'right',
      className: 'tabular-nums text-text-dim',
      sortValue: (r) => r.unsoldCost,
      render: (r) => formatIsk(r.unsoldCost),
    },
    {
      id: 'moreActions',
      header: '',
      align: 'right',
      render: (r) => moreActionsFor(r.productTypeID, r.itemName),
    },
  ];

  const runColumns: DataTableColumn<RunRow>[] = [
    loggedAtColumn(t, timeZone),
    {
      id: 'item',
      header: t('industry.productionRunColumnItem'),
      sortValue: (r) => r.itemName,
      render: (r) => r.itemName,
    },
    quantityColumn(t),
    totalCostColumn(t),
    quantitySoldColumn(t),
    realizedProfitColumn(t, skills, (r) => standingByPlanId.get(r.run.buildPlanId)),
    statusColumn(t),
    soldActionsColumn(sale),
    {
      id: 'moreActions',
      header: '',
      align: 'right',
      render: (r) => moreActionsFor(r.run.productTypeID, r.itemName),
    },
  ];

  return (
    <Panel
      title={t('industry.productionLog')}
      actions={
        <FilterBar
          value={filter}
          onChange={setFilter}
          activeCount={activeProductionLogFilterCount(filter)}
        >
          {(draft, setDraft) => <ProductionLogDateRange draft={draft} setDraft={setDraft} />}
        </FilterBar>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
        <div className="space-y-2">
          <div className="flex flex-col gap-1 rounded-xs border border-line bg-panel-2 px-3 py-2">
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('industry.totalRealizedProfit')}
            </span>
            <span
              className={`text-3xl leading-tight font-semibold tabular-nums ${iskToneClass(totalRealizedProfit)}`}
            >
              {formatIsk(totalRealizedProfit)} ISK
            </span>
            <span className="text-[0.6875rem] text-text-dim">
              {t('industry.productionLogSubtitle')}
            </span>
            <span className="text-[0.6875rem] text-text-dim">
              {t('industry.productionLogCaveat', {
                runs: filteredRunCount,
                items: itemRows.length,
              })}
            </span>
          </div>
          {summaries.some((s) => s.profit.brokerFee > 0) && (
            <AssumesBaseStandingsNote
              characterId={characterId}
              hint={t('industry.productionLogAssumesBaseStandingsHint')}
            />
          )}
          <div className="divide-y divide-line rounded-xs border border-line">
            <TotalRow label={t('industry.totalCostLogged')} value={formatIsk(totalCostLogged)} />
            <TotalRow
              label={t('industry.totalRevenueLinked')}
              value={formatIsk(totalRevenueLinked)}
            />
            <TotalRow
              label={t('industry.openInventoryValue')}
              value={formatIsk(openInventoryValue)}
            />
            <TotalRow
              label={t('industry.avgMargin')}
              value={avgMarginPct === null ? t('common.unknown') : formatPercent(avgMarginPct)}
            />
          </div>
        </div>

        {runRows.length === 0 ? (
          <EmptyState
            title={t('industry.productionLogFilteredEmptyTitle')}
            hint={t('industry.productionLogFilteredEmptyHint')}
            className="py-6"
          />
        ) : (
          <div className="min-w-0 space-y-4">
            {profitHistoryPoints.length >= 2 && (
              <Suspense
                fallback={
                  <div className="flex justify-center py-8">
                    <Spinner label={t('common.loading')} />
                  </div>
                }
              >
                <LazyProductionProfitChart
                  points={profitHistoryPoints}
                  trend={profitHistoryTrend}
                />
              </Suspense>
            )}
            <div>
              <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                {t('industry.byItem')}
              </h3>
              <DataTable
                columns={columns}
                rows={itemRows}
                rowKey={(r) => r.productTypeID}
                rowContextMenu={(r, tr) => itemMenuFor(r.productTypeID, r.itemName, tr)}
                label={t('industry.byItem')}
                sort={knownSort(itemSort, columns)}
                onSortChange={setItemSort}
                mobileSort
                density="compact"
              />
            </div>

            <CollapsiblePanel
              title={t('industry.allProductionRuns')}
              meta={<span className="text-xs tabular-nums text-text-dim">{runRows.length}</span>}
              expanded={runsExpanded}
              onToggle={() => setRunsExpanded((open) => !open)}
              labels={{
                show: t('industry.productionLogShowRuns'),
                hide: t('industry.productionLogHideRuns'),
              }}
              padded={false}
            >
              <div className="overflow-x-auto">
                <DataTable
                  columns={runColumns}
                  rows={runRows}
                  rowKey={(r) => r.run.id}
                  rowContextMenu={(r, tr) => itemMenuFor(r.run.productTypeID, r.itemName, tr)}
                  label={t('industry.allProductionRuns')}
                  sort={knownSort(runSort, runColumns)}
                  onSortChange={setRunSort}
                  mobileSort
                  density="compact"
                  onRowClick={
                    onOpenRun ? (r) => r.planExists && onOpenRun(r.run.buildPlanId) : undefined
                  }
                />
              </div>
            </CollapsiblePanel>
          </div>
        )}
      </div>

      <SaleLinkingModals sale={sale} />
    </Panel>
  );
}
