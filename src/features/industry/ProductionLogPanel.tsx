import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { DataTable, EmptyState, Panel } from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import type { SkillLevels } from '@/engine/industry/types';
import type { BlueprintCatalog } from './blueprintCatalog';
import { summarizeProductionRun } from './productionRunSummary';
import { formatIsk } from '@/lib/isk';
import { formatPercent } from './format';

interface ProductionLogPanelProps {
  characterId: number;
  catalog: BlueprintCatalog;
  skills: SkillLevels;
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

function toneClass(value: number): string {
  return value >= 0 ? 'text-isk-pos' : 'text-isk-neg';
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
 * Cross-plan, cross-item realized-profit rollup (issue #525) — the aggregate
 * "Production Log" the original design mockup's final step showed. Distinct
 * from `ProductionRunsPanel`, which is scoped to one Build Plan's own runs:
 * this reads every Production Run the character has logged, grouped by
 * product, regardless of which plan it came from. Placed as its own panel on
 * `/industry` (the mockup's own undecided-at-the-time choice between that and
 * a dedicated route) rather than a new route.
 */
export function ProductionLogPanel({ characterId, catalog, skills }: ProductionLogPanelProps) {
  const { t } = useTranslation();

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

  const summaries = runs.map((run) => summarizeProductionRun(run, saleLinks, orderWatches, skills));

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
      cellClassName: (r) => toneClass(r.realizedProfit),
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

  return (
    <Panel title={t('industry.productionLog')}>
      <div className="space-y-1">
        <p className="text-[0.6875rem] text-text-dim">{t('industry.productionLogSubtitle')}</p>
        <p className="text-[0.6875rem] text-text-faint">
          {t('industry.productionLogCaveat', { runs: runs.length, items: itemCount })}
        </p>
      </div>

      <div className="my-3 flex flex-wrap gap-2">
        <BigStat
          label={t('industry.totalRealizedProfit')}
          value={formatIsk(totalRealizedProfit)}
          tone={toneClass(totalRealizedProfit)}
        />
        <BigStat label={t('industry.totalCostLogged')} value={formatIsk(totalCostLogged)} />
        <BigStat label={t('industry.totalRevenueLinked')} value={formatIsk(totalRevenueLinked)} />
        <BigStat label={t('industry.openInventoryValue')} value={formatIsk(openInventoryValue)} />
      </div>

      <div className="rounded-xs border border-line">
        <div className="border-b border-line px-2.5 py-1.5 text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('industry.byItem')}
        </div>
        <DataTable
          columns={columns}
          rows={itemRows}
          rowKey={(r) => r.productTypeID}
          label={t('industry.byItem')}
          density="compact"
        />
      </div>
    </Panel>
  );
}
