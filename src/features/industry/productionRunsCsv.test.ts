import { describe, expect, it } from 'vitest';
import {
  productionLogItemsCsvColumns,
  productionLogRunsCsvColumns,
  productionRunsCsvColumns,
  type ProductionLogItemCsvRow,
} from './productionRunsCsv';
import type { ProductionRunSummary } from './productionRunSummary';

const t = (k: string) => k;

const LOGGED = Date.UTC(2026, 8, 1, 12, 30, 0);

function summary(): ProductionRunSummary {
  return {
    run: {
      id: 'r1',
      characterId: 1,
      buildPlanId: 'p1',
      productTypeID: 587,
      quantity: 10,
      materialCost: 900,
      jobFee: 100,
      totalCost: 1000,
      loggedAt: LOGGED,
      updatedAt: LOGGED,
    },
    saleLinks: [],
    orderWatches: [],
    profit: {
      totalCost: 1000,
      quantitySold: 4,
      grossRevenue: 800,
      salesTax: 10,
      brokerFee: 5,
      netRevenue: 785,
      profit: -215,
      marginPct: -26.875,
    },
    quantitySold: 4,
    remaining: 6,
    status: 'open',
    openInventoryValue: 600,
  };
}

describe('productionRunsCsvColumns', () => {
  const columns = productionRunsCsvColumns(t);

  it("orders columns as a plan's Production Runs table does", () => {
    expect(columns.map((c) => c.header)).toEqual([
      'industry.productionRunColumnLogged',
      'industry.quantity',
      'industry.totalCost',
      'industry.realizedRevenue',
      'industry.realizedProfit',
      'industry.productionRunColumnSold',
      'industry.productionRunColumnStatus',
    ]);
  });

  it('exports the logged time as a UTC ISO timestamp and figures raw', () => {
    expect(columns.map((c) => c.value(summary()))).toEqual([
      '2026-09-01T12:30:00.000Z',
      10,
      1000,
      800,
      -215,
      4,
      'industry.productionRunStatusOpen',
    ]);
  });
});

describe('productionLogRunsCsvColumns', () => {
  it('adds the item after Logged, in the log table order', () => {
    const columns = productionLogRunsCsvColumns(t);
    expect(columns.map((c) => c.header)).toEqual([
      'industry.productionRunColumnLogged',
      'industry.productionRunColumnItem',
      'industry.quantity',
      'industry.totalCost',
      'industry.productionRunColumnSold',
      'industry.realizedProfit',
      'industry.productionRunColumnStatus',
    ]);
    expect(columns[1].value({ ...summary(), itemName: 'Rifter' })).toBe('Rifter');
  });
});

describe('productionLogItemsCsvColumns', () => {
  const columns = productionLogItemsCsvColumns(t);
  const item: ProductionLogItemCsvRow = {
    itemName: 'Rifter',
    runsLogged: 3,
    unitsProduced: 30,
    unitsSold: 0,
    realizedProfit: -500,
    avgMarginPct: null,
    soldUnitsMargin: 0,
    unsoldCost: 3000,
  };

  it('orders columns as the By item table does', () => {
    expect(columns.map((c) => c.header)).toEqual([
      'industry.product',
      'industry.runsLogged',
      'industry.unitsProduced',
      'industry.unitsSold',
      'industry.realizedProfit',
      'industry.csvAvgMarginPct',
      'industry.soldUnitsMargin',
      'industry.unsoldCost',
    ]);
  });

  it('blanks the margins the table shows as "—" when nothing sold', () => {
    expect(columns.map((c) => c.value(item))).toEqual(['Rifter', 3, 30, 0, -500, null, null, 3000]);
  });

  it('exports both margins once units have sold', () => {
    const sold = { ...item, unitsSold: 5, avgMarginPct: 12.5, soldUnitsMargin: 250 };
    expect(columns[5].value(sold)).toBe(12.5);
    expect(columns[6].value(sold)).toBe(250);
  });
});
