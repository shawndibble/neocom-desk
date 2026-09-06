import type { DataTableColumn } from '@/components/ui';
import type { ProductionRunSummary } from './productionRunSummary';
import { ProductionRunStatusChip } from './ProductionRunStatusChip';
import { SoldSplitButton } from './SaleLinkingControls';
import type { SaleLinking } from './useSaleLinking';
import { iskToneClass } from '@/features/character/format';
import { formatIsk } from '@/lib/isk';

type T = (key: string) => string;

/**
 * The `DataTableColumn`s `ProductionRunsPanel` (one Build Plan's own runs)
 * and `ProductionLogPanel` (every run, every plan) share verbatim — every
 * row in either table is a `ProductionRunSummary`, so one column definition
 * covers both regardless of what else the row type adds (`ProductionLogPanel`
 * also carries `itemName`/`planExists`). Each panel still assembles its own
 * `columns` array in its own order and splices in its own extra columns
 * (`realizedRevenue` for the per-plan panel, `item` for the cross-plan one)
 * — factoring out a single fixed-order column list would have forced one of
 * the two tables to reorder columns it already shipped with.
 */

export function loggedAtColumn<Row extends ProductionRunSummary>(t: T): DataTableColumn<Row> {
  return {
    id: 'loggedAt',
    header: t('industry.productionRunColumnLogged'),
    primary: true,
    className: 'whitespace-nowrap',
    sortValue: (r) => r.run.loggedAt,
    render: (r) => new Date(r.run.loggedAt).toLocaleDateString(),
  };
}

export function quantityColumn<Row extends ProductionRunSummary>(t: T): DataTableColumn<Row> {
  return {
    id: 'quantity',
    header: t('industry.quantity'),
    align: 'right',
    className: 'tabular-nums',
    sortValue: (r) => r.run.quantity,
    render: (r) => r.run.quantity.toLocaleString(),
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
    render: (r) => `${r.quantitySold.toLocaleString()} / ${r.run.quantity.toLocaleString()}`,
  };
}

export function realizedProfitColumn<Row extends ProductionRunSummary>(t: T): DataTableColumn<Row> {
  return {
    id: 'realizedProfit',
    header: t('industry.realizedProfit'),
    align: 'right',
    className: 'tabular-nums font-semibold',
    cellClassName: (r) => iskToneClass(r.profit.profit),
    sortValue: (r) => r.profit.profit,
    render: (r) => formatIsk(r.profit.profit),
  };
}

export function statusColumn<Row extends ProductionRunSummary>(t: T): DataTableColumn<Row> {
  return {
    id: 'status',
    header: t('industry.productionRunColumnStatus'),
    align: 'right',
    sortValue: (r) => r.status,
    render: (r) => <ProductionRunStatusChip status={r.status} />,
  };
}

/** The "Sold" split button wired to `useSaleLinking`, keyed off each row's own run/product — no plan context needed. */
export function soldActionsColumn<Row extends ProductionRunSummary>(
  sale: SaleLinking
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
