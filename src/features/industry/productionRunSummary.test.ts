import { describe, it, expect } from 'vitest';
import { summarizeProductionRun } from './productionRunSummary';
import type {
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
