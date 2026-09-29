import type { CsvColumn, CsvTranslate } from '@/lib/csv';
import type { ProductionRunStatus, ProductionRunSummary } from './productionRunSummary';

const STATUS_KEY: Record<ProductionRunStatus, string> = {
  new: 'industry.productionRunStatusNew',
  open: 'industry.productionRunStatusOpen',
  closed: 'industry.productionRunStatusClosed',
};

/*
 * The per-column pieces `ProductionRunsPanel` and `ProductionLogPanel` share,
 * mirroring `productionRunColumns.tsx`: each table assembles its own order.
 * `loggedAt` is epoch ms, exported as a UTC ISO timestamp so it lands as a
 * real date; every ISK figure is raw, at full precision.
 */
function loggedAt<Row extends ProductionRunSummary>(t: CsvTranslate): CsvColumn<Row> {
  return {
    header: t('industry.productionRunColumnLogged'),
    value: (r) => new Date(r.run.loggedAt).toISOString(),
  };
}
function quantity<Row extends ProductionRunSummary>(t: CsvTranslate): CsvColumn<Row> {
  return { header: t('industry.quantity'), value: (r) => r.run.quantity };
}
function totalCost<Row extends ProductionRunSummary>(t: CsvTranslate): CsvColumn<Row> {
  return { header: t('industry.totalCost'), value: (r) => r.run.totalCost };
}
function realizedProfit<Row extends ProductionRunSummary>(t: CsvTranslate): CsvColumn<Row> {
  return { header: t('industry.realizedProfit'), value: (r) => r.profit.profit };
}
function quantitySold<Row extends ProductionRunSummary>(t: CsvTranslate): CsvColumn<Row> {
  return { header: t('industry.productionRunColumnSold'), value: (r) => r.quantitySold };
}
function status<Row extends ProductionRunSummary>(t: CsvTranslate): CsvColumn<Row> {
  return { header: t('industry.productionRunColumnStatus'), value: (r) => t(STATUS_KEY[r.status]) };
}

/** One Build Plan's Production Runs table. */
export function productionRunsCsvColumns(t: CsvTranslate): CsvColumn<ProductionRunSummary>[] {
  return [
    loggedAt(t),
    quantity(t),
    totalCost(t),
    { header: t('industry.realizedRevenue'), value: (r) => r.profit.grossRevenue },
    realizedProfit(t),
    quantitySold(t),
    status(t),
  ];
}

/** The Production Log's "All production runs" table. */
export function productionLogRunsCsvColumns(
  t: CsvTranslate
): CsvColumn<ProductionRunSummary & { itemName: string }>[] {
  return [
    loggedAt(t),
    { header: t('industry.productionRunColumnItem'), value: (r) => r.itemName },
    quantity(t),
    totalCost(t),
    quantitySold(t),
    realizedProfit(t),
    status(t),
  ];
}

/** The Production Log's "By item" row, structurally — the panel's own row type carries more. */
export interface ProductionLogItemCsvRow {
  itemName: string;
  runsLogged: number;
  unitsProduced: number;
  unitsSold: number;
  realizedProfit: number;
  avgMarginPct: number | null;
  soldUnitsMargin: number;
  unsoldCost: number;
}

/**
 * The Production Log's "By item" table. Both margins are blank where the
 * table shows "—" (nothing sold); the average margin is a raw percent.
 */
export function productionLogItemsCsvColumns(
  t: CsvTranslate
): CsvColumn<ProductionLogItemCsvRow>[] {
  return [
    { header: t('industry.product'), value: (r) => r.itemName },
    { header: t('industry.runsLogged'), value: (r) => r.runsLogged },
    { header: t('industry.unitsProduced'), value: (r) => r.unitsProduced },
    { header: t('industry.unitsSold'), value: (r) => r.unitsSold },
    { header: t('industry.realizedProfit'), value: (r) => r.realizedProfit },
    { header: t('industry.csvAvgMarginPct'), value: (r) => r.avgMarginPct },
    {
      header: t('industry.soldUnitsMargin'),
      value: (r) => (r.unitsSold > 0 ? r.soldUnitsMargin : null),
    },
    { header: t('industry.unsoldCost'), value: (r) => r.unsoldCost },
  ];
}
