import type { DataTableColumn } from '@/components/ui';
import type { SkillLevels } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { ProductionRunSummary } from './productionRunSummary';
import { ProductionRunLostBadge, ProductionRunStatusChip } from './ProductionRunStatusChip';
import { RealizedProfitCell } from './RealizedProfitCell';
import { SoldSplitButton } from './SaleLinkingControls';
import type { SaleLinking } from './useSaleLinking';
import type { RunLoss } from './useRunLoss';
import { iskToneClass } from '@/features/character/format';
import { formatIsk } from '@/lib/isk';
import { formatDateOnly } from '@/lib/timestamp';
import { formatCount } from '@/lib/formatCount';

type T = (key: string) => string;

export function loggedAtColumn<Row extends ProductionRunSummary>(
  t: T,
  timeZone?: string
): DataTableColumn<Row> {
  return {
    id: 'loggedAt',
    header: t('industry.productionRunColumnLogged'),
    primary: true,
    className: 'whitespace-nowrap',
    sortValue: (r) => r.run.loggedAt,
    render: (r) => formatDateOnly(new Date(r.run.loggedAt), timeZone),
  };
}

export function quantityColumn<Row extends ProductionRunSummary>(t: T): DataTableColumn<Row> {
  return {
    id: 'quantity',
    header: t('industry.quantity'),
    align: 'right',
    className: 'tabular-nums',
    sortValue: (r) => r.run.quantity,
    render: (r) => formatCount(r.run.quantity),
  };
}

export function totalCostColumn<Row extends ProductionRunSummary>(t: T): DataTableColumn<Row> {
  return {
    id: 'totalCost',
    header: t('industry.totalCost'),
    align: 'right',
    className: 'tabular-nums',
    sortValue: (r) => r.run.totalCost,
    render: (r) => formatIsk(r.run.totalCost),
  };
}

export function quantitySoldColumn<Row extends ProductionRunSummary>(t: T): DataTableColumn<Row> {
  return {
    id: 'quantitySold',
    header: t('industry.productionRunColumnSold'),
    align: 'right',
    className: 'tabular-nums text-text-dim',
    sortValue: (r) => r.quantitySold,
    render: (r) => `${formatCount(r.quantitySold)} / ${formatCount(r.run.quantity)}`,
  };
}

export function realizedProfitColumn<Row extends ProductionRunSummary>(
  t: T,
  skills: SkillLevels,
  standingFor?: (row: Row) => ResolvedStandings | undefined
): DataTableColumn<Row> {
  return {
    id: 'realizedProfit',
    header: t('industry.realizedProfit'),
    align: 'right',
    className: 'tabular-nums font-semibold',
    cellClassName: (r) => iskToneClass(r.profit.profit),
    sortValue: (r) => r.profit.profit,
    render: (r) => (
      <RealizedProfitCell
        row={r}
        label={t('industry.breakdownTrigger')}
        skills={skills}
        standing={standingFor?.(r)}
      />
    ),
  };
}

export function statusColumn<Row extends ProductionRunSummary>(t: T): DataTableColumn<Row> {
  return {
    id: 'status',
    header: t('industry.productionRunColumnStatus'),
    align: 'right',
    sortValue: (r) => r.status,
    render: (r) => (
      <span className="inline-flex items-center justify-end gap-1.5">
        {r.quantityLost > 0 && <ProductionRunLostBadge count={r.quantityLost} />}
        <ProductionRunStatusChip status={r.status} />
      </span>
    ),
  };
}

export function soldActionsColumn<Row extends ProductionRunSummary>(
  sale: SaleLinking,
  runLoss: RunLoss
): DataTableColumn<Row> {
  return {
    id: 'actions',
    header: '',
    align: 'right',
    render: (r) => (
      <SoldSplitButton
        onSold={() => void sale.openPicker(r.run.id, r.run.productTypeID, 'sale')}
        onWatch={() => void sale.openPicker(r.run.id, r.run.productTypeID, 'watch')}
        onManual={() => sale.openManualSale(r.run.id)}
        onLost={() => void runLoss.openLoss(r)}
        losses={r.losses}
        onEditLoss={(loss) => void runLoss.openLoss(r, loss)}
        onRemoveLoss={(loss) => runLoss.confirmRemoveLoss(loss.id)}
        onDelete={() => sale.confirmDeleteRun(r.run.id)}
        onRefresh={
          r.orderWatches.some((w) => !w.closed)
            ? () => void sale.refreshWatches(r.run.id)
            : undefined
        }
        refreshing={sale.refreshingRunId === r.run.id}
      />
    ),
  };
}
