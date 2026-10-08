import { describe, it, expect } from 'vitest';
import { rollupProductionRuns, summarizeProductionRun } from './productionRunSummary';
import type {
  ProductionLossRecord,
  ProductionOrderWatchRecord,
  ProductionRunRecord,
  ProductionSaleLinkRecord,
} from '@/db';
import { SKILL_IDS } from '@/engine/industry/types';

function run(overrides: Partial<ProductionRunRecord> = {}): ProductionRunRecord {
  return {
    id: 'run-1',
    characterId: 1,
    buildPlanId: 'plan-1',
    productTypeID: 587,
    quantity: 10,
    materialCost: 500_000,
    jobFee: 50_000,
    totalCost: 550_000,
    loggedAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function saleLink(overrides: Partial<ProductionSaleLinkRecord> = {}): ProductionSaleLinkRecord {
  return {
    id: '1:txn:1',
    characterId: 1,
    runId: 'run-1',
    transactionId: 1,
    quantity: 5,
    unitPrice: 100_000,
    linkedAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function orderWatch(
  overrides: Partial<ProductionOrderWatchRecord> = {}
): ProductionOrderWatchRecord {
  return {
    id: '1:order:1',
    characterId: 1,
    runId: 'run-1',
    orderId: 1,
    unitPrice: 95_000,
    initialVolumeRemain: 5,
    lastKnownVolumeRemain: 5,
    closed: false,
    watchedAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function loss(overrides: Partial<ProductionLossRecord> = {}): ProductionLossRecord {
  return {
    id: '1:loss:1',
    characterId: 1,
    runId: 'run-1',
    quantity: 4,
    lostAt: Date.now(),
    insurancePayout: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('summarizeProductionRun with losses', () => {
  it('leaves a run without losses unchanged', () => {
    const s = summarizeProductionRun(run(), [], [], {}, undefined, []);
    expect(s.quantityLost).toBe(0);
    expect(s.profit.profit).toBe(-550_000);
  });

  it('writes lost units off open inventory and counts insurance as proceeds', () => {
    const s = summarizeProductionRun(run(), [], [], {}, undefined, [
      loss({ quantity: 4, insurancePayout: 100_000 }),
    ]);
    expect(s.quantityLost).toBe(4);
    expect(s.remaining).toBe(6);
    expect(s.openInventoryValue).toBe(330_000);
    expect(s.profit.profit).toBe(-450_000);
    expect(s.status).toBe('open');
  });

  it('sums several loss records and closes the run once sold plus lost covers it', () => {
    const s = summarizeProductionRun(run(), [saleLink({ quantity: 3 })], [], {}, undefined, [
      loss({ quantity: 4 }),
      loss({ id: '1:loss:2', quantity: 3, insurancePayout: 50_000 }),
    ]);
    expect(s.quantityLost).toBe(7);
    expect(s.remaining).toBe(0);
    expect(s.status).toBe('closed');
  });

  it('ignores losses that belong to another run', () => {
    const s = summarizeProductionRun(run(), [], [], {}, undefined, [loss({ runId: 'other' })]);
    expect(s.quantityLost).toBe(0);
    expect(s.status).toBe('new');
  });
});

describe('summarizeProductionRun', () => {
  it('is "new" with zero remaining sold and the full quantity as open inventory', () => {
    const summary = summarizeProductionRun(run(), [], [], {});
    expect(summary.status).toBe('new');
    expect(summary.quantitySold).toBe(0);
    expect(summary.remaining).toBe(10);
    expect(summary.openInventoryValue).toBe(550_000); // 10 units @ 55,000/unit
  });

  it('is "open" once partially sold, with open inventory valued at cost basis for the rest', () => {
    const summary = summarizeProductionRun(run(), [saleLink({ quantity: 4 })], [], {});
    expect(summary.status).toBe('open');
    expect(summary.quantitySold).toBe(4);
    expect(summary.remaining).toBe(6);
    expect(summary.openInventoryValue).toBe(6 * 55_000);
  });

  it('is "closed" once fully sold, with zero open inventory', () => {
    const summary = summarizeProductionRun(run(), [saleLink({ quantity: 10 })], [], {});
    expect(summary.status).toBe('closed');
    expect(summary.remaining).toBe(0);
    expect(summary.openInventoryValue).toBe(0);
  });

  it('combines linked sales and watched-order fills into quantitySold', () => {
    const summary = summarizeProductionRun(
      run(),
      [saleLink({ quantity: 3 })],
      [orderWatch({ initialVolumeRemain: 5, lastKnownVolumeRemain: 2 })], // filled 3
      {}
    );
    expect(summary.quantitySold).toBe(6);
    expect(summary.status).toBe('open');
  });

  it('is "closed" (not "open") when sold reaches quantity exactly via a watch fill', () => {
    const summary = summarizeProductionRun(
      run({ quantity: 5 }),
      [],
      [orderWatch({ initialVolumeRemain: 5, lastKnownVolumeRemain: 0 })],
      {}
    );
    expect(summary.status).toBe('closed');
    expect(summary.remaining).toBe(0);
  });

  it('feeds accounting/broker-relations skills through to the realized profit calc', () => {
    const summary = summarizeProductionRun(
      run(),
      [saleLink({ quantity: 10, unitPrice: 100_000 })],
      [],
      {
        [SKILL_IDS.accounting]: 5,
      }
    );
    // salesTaxPct(5) = 3.375%, so tax on 1,000,000 = 33,750
    expect(summary.profit.salesTax).toBeCloseTo(33_750, 5);
  });

  it('only counts links/watches belonging to this run, ignoring others in the same arrays', () => {
    const summary = summarizeProductionRun(
      run(),
      [saleLink({ quantity: 4 }), saleLink({ id: '1:txn:2', runId: 'other-run', quantity: 99 })],
      [],
      {}
    );
    expect(summary.quantitySold).toBe(4);
  });
});

describe('rollupProductionRuns', () => {
  const base = {
    saleLinks: [],
    orderWatches: [],
    losses: [],
    quantityLost: 0,
    quantitySold: 0,
    remaining: 0,
  };
  const row = (status: 'new' | 'open' | 'closed', profit: number) =>
    ({
      ...base,
      run: { id: status + profit } as never,
      profit: { profit } as never,
      status,
      openInventoryValue: 0,
    }) as never;

  it('totals realized profit and counts runs still selling', () => {
    const rollup = rollupProductionRuns([row('closed', 100), row('open', 20), row('new', 0)]);
    expect(rollup).toEqual({ count: 3, realizedProfit: 120, openCount: 2 });
  });

  it('is zero for no runs', () => {
    expect(rollupProductionRuns([])).toEqual({ count: 0, realizedProfit: 0, openCount: 0 });
  });
});
