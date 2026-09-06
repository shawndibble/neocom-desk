import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BuildPlanRecord } from '@/db';
import {
  DataTable,
  EmptyState,
  FilterBar,
  Panel,
  TextInput,
  useFilterSurface,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import { cx } from '@/lib/cx';
import type { SkillLevels } from '@/engine/industry/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import {
  EMPTY_PRODUCTION_LOG_FILTER,
  activeProductionLogFilterCount,
  filterProductionRunsByDate,
  type ProductionLogFilter,
} from './productionLogFilter';
import { summarizeProductionRun, type ProductionRunSummary } from './productionRunSummary';
import { ProductionRunStatusChip } from './ProductionRunStatusChip';
import { SaleLinkingModals, SoldSplitButton } from './SaleLinkingControls';
import { useSaleLinking } from './useSaleLinking';
import { iskToneClass } from '@/features/character/format';
import { formatIsk } from '@/lib/isk';
import { formatPercent } from './format';

interface ProductionLogPanelProps {
  characterId: number;
  catalog: BlueprintCatalog;
  skills: SkillLevels;
  plans: BuildPlanRecord[];
  /** Row click on the runs table: hands back the run's own Build Plan so the caller can jump to it. */
  onOpenRun?: (buildPlanId: string) => void;
}

interface ItemRow {
  productTypeID: number;
  itemName: string;
  runsLogged: number;
  unitsProduced: number;
  unitsSold: number;
  realizedProfit: number;
  /** Null when nothing has sold for this item yet — a percentage of zero revenue is not a number. */
  avgMarginPct: number | null;
}

/** One label-over-value block, matching the design's larger dashboard stat (distinct from the compact `StatChip`). */
function BigStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex min-w-36 flex-col gap-1 rounded-xs border border-line bg-panel-2 px-3 py-2">
      <span className="text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </span>
      <span className={`text-base font-semibold tabular-nums ${tone ?? 'text-text'}`}>{value}</span>
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

interface RunRow {
  summary: ProductionRunSummary;
  itemName: string;
  /** Whether the run's own Build Plan still exists — a run outlives a deleted plan (locked financial record), so this gates the row-click navigation rather than a display column. */
  planExists: boolean;
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
}: ProductionLogPanelProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<ProductionLogFilter>(EMPTY_PRODUCTION_LOG_FILTER);

  const runs =
    useLiveQuery(
      () => db.productionRuns.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? [];
  const saleLinks =
    useLiveQuery(
      () => db.productionSaleLinks.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? [];
  const orderWatches =
    useLiveQuery(
      () => db.productionOrderWatches.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? [];

  const sale = useSaleLinking(characterId, saleLinks, orderWatches);

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

  const planIds = new Set(plans.map((p) => p.id));
  const filteredRuns = filterProductionRunsByDate(runs, filter);
  const summaries = filteredRuns.map((run) =>
    summarizeProductionRun(run, saleLinks, orderWatches, skills)
  );

  const totalRealizedProfit = summaries.reduce((sum, s) => sum + s.profit.profit, 0);
  const totalCostLogged = summaries.reduce((sum, s) => sum + s.run.totalCost, 0);
  const totalRevenueLinked = summaries.reduce((sum, s) => sum + s.profit.grossRevenue, 0);
  const openInventoryValue = summaries.reduce((sum, s) => sum + s.openInventoryValue, 0);

  const byItem = new Map<number, ItemRow>();
  for (const s of summaries) {
    const typeID = s.run.productTypeID;
    const existing = byItem.get(typeID);
    if (existing) {
      existing.runsLogged += 1;
      existing.unitsProduced += s.run.quantity;
      existing.unitsSold += s.quantitySold;
      existing.realizedProfit += s.profit.profit;
    } else {
      byItem.set(typeID, {
        productTypeID: typeID,
        itemName: catalog.byProductTypeID.get(typeID)?.productName ?? `#${typeID}`,
        runsLogged: 1,
        unitsProduced: s.run.quantity,
        unitsSold: s.quantitySold,
        realizedProfit: s.profit.profit,
        avgMarginPct: null,
      });
    }
  }
  // Margin is computed per item over its combined revenue, not averaged from
  // the per-run percentages — a weighted rollup, the same reasoning
  // `realizedProfit`'s own marginPct uses per run.
  const revenueByItem = new Map<number, number>();
  for (const s of summaries) {
    revenueByItem.set(
      s.run.productTypeID,
      (revenueByItem.get(s.run.productTypeID) ?? 0) + s.profit.grossRevenue
    );
  }
  const itemRows = Array.from(byItem.values()).map((row) => {
    const revenue = revenueByItem.get(row.productTypeID) ?? 0;
    return { ...row, avgMarginPct: revenue > 0 ? (row.realizedProfit / revenue) * 100 : null };
  });

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
  ];

  const itemCount = byItem.size;

  const runRows: RunRow[] = summaries
    .map((summary) => ({
      summary,
      itemName:
        catalog.byProductTypeID.get(summary.run.productTypeID)?.productName ??
        `#${summary.run.productTypeID}`,
      planExists: planIds.has(summary.run.buildPlanId),
    }))
    .sort((a, b) => b.summary.run.loggedAt - a.summary.run.loggedAt);

  const runColumns: DataTableColumn<RunRow>[] = [
    {
      id: 'loggedAt',
      header: t('industry.productionRunColumnLogged'),
      primary: true,
      className: 'whitespace-nowrap',
      sortValue: (r) => r.summary.run.loggedAt,
      render: (r) => new Date(r.summary.run.loggedAt).toLocaleDateString(),
    },
    {
      id: 'item',
      header: t('industry.productionRunColumnItem'),
      sortValue: (r) => r.itemName,
      render: (r) => r.itemName,
    },
    {
      id: 'quantity',
      header: t('industry.quantity'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.summary.run.quantity,
      render: (r) => r.summary.run.quantity.toLocaleString(),
    },
    {
      id: 'totalCost',
      header: t('industry.totalCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.summary.run.totalCost,
      render: (r) => formatIsk(r.summary.run.totalCost),
    },
    {
      id: 'quantitySold',
      header: t('industry.productionRunColumnSold'),
      align: 'right',
      className: 'tabular-nums text-text-dim',
      sortValue: (r) => r.summary.quantitySold,
      render: (r) =>
        `${r.summary.quantitySold.toLocaleString()} / ${r.summary.run.quantity.toLocaleString()}`,
    },
    {
      id: 'realizedProfit',
      header: t('industry.realizedProfit'),
      align: 'right',
      className: 'tabular-nums font-semibold',
      cellClassName: (r) => iskToneClass(r.summary.profit.profit),
      sortValue: (r) => r.summary.profit.profit,
      render: (r) => formatIsk(r.summary.profit.profit),
    },
    {
      id: 'status',
      header: t('industry.productionRunColumnStatus'),
      align: 'right',
      sortValue: (r) => r.summary.status,
      render: (r) => <ProductionRunStatusChip status={r.summary.status} />,
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <SoldSplitButton
          onSold={() => void sale.openPicker(r.summary.run.id, r.summary.run.productTypeID, 'sale')}
          onWatch={() =>
            void sale.openPicker(r.summary.run.id, r.summary.run.productTypeID, 'watch')
          }
          onManual={() => sale.openManualSale(r.summary.run.id)}
          onRefresh={
            r.summary.orderWatches.some((w) => !w.closed)
              ? () => void sale.refreshWatches(r.summary.run.id)
              : undefined
          }
          refreshing={sale.refreshingRunId === r.summary.run.id}
        />
      ),
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
      <div className="space-y-1">
        <p className="text-[0.6875rem] text-text-dim">{t('industry.productionLogSubtitle')}</p>
        <p className="text-[0.6875rem] text-text-faint">
          {t('industry.productionLogCaveat', { runs: filteredRuns.length, items: itemCount })}
        </p>
      </div>

      <div className="my-3 flex flex-wrap gap-2">
        <BigStat
          label={t('industry.totalRealizedProfit')}
          value={formatIsk(totalRealizedProfit)}
          tone={iskToneClass(totalRealizedProfit)}
        />
        <BigStat label={t('industry.totalCostLogged')} value={formatIsk(totalCostLogged)} />
        <BigStat label={t('industry.totalRevenueLinked')} value={formatIsk(totalRevenueLinked)} />
        <BigStat label={t('industry.openInventoryValue')} value={formatIsk(openInventoryValue)} />
      </div>

      {runRows.length === 0 ? (
        <EmptyState
          title={t('industry.productionLogFilteredEmptyTitle')}
          hint={t('industry.productionLogFilteredEmptyHint')}
          className="py-6"
        />
      ) : (
        <>
          <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('industry.allProductionRuns')}
          </h3>
          <DataTable
            columns={runColumns}
            rows={runRows}
            rowKey={(r) => r.summary.run.id}
            label={t('industry.allProductionRuns')}
            density="compact"
            className="mb-5"
            // Only navigates when the run's own Build Plan still exists — a
            // logged run is a locked financial record that outlives a
            // deleted plan (see planSync.ts's markBuildPlanDeleted), so a
            // click here has nowhere left to jump to.
            onRowClick={
              onOpenRun ? (r) => r.planExists && onOpenRun(r.summary.run.buildPlanId) : undefined
            }
          />

          <h3 className="border-b border-line pb-1 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
            {t('industry.byItem')}
          </h3>
          <DataTable
            columns={columns}
            rows={itemRows}
            rowKey={(r) => r.productTypeID}
            label={t('industry.byItem')}
            density="compact"
          />
        </>
      )}

      <SaleLinkingModals sale={sale} />
    </Panel>
  );
}
