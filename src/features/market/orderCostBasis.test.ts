import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { loadOrderCostBases } from './orderCostBasis';

const CHARACTER_ID = 1;

async function addRun(overrides: Partial<Parameters<typeof db.productionRuns.add>[0]> = {}) {
  const now = Date.now();
  await db.productionRuns.add({
    id: 'run-1',
    characterId: CHARACTER_ID,
    buildPlanId: 'plan-1',
    productTypeID: 587,
    quantity: 10,
    materialCost: 300_000,
    jobFee: 20_000,
    totalCost: 320_000,
    loggedAt: now,
    updatedAt: now,
    ...overrides,
  });
}

async function addWatch(
  orderId: number,
  overrides: Partial<Parameters<typeof db.productionOrderWatches.add>[0]> = {}
) {
  const now = Date.now();
  await db.productionOrderWatches.add({
    id: `${CHARACTER_ID}:order:${orderId}`,
    characterId: CHARACTER_ID,
    runId: 'run-1',
    orderId,
    unitPrice: 100_000,
    initialVolumeRemain: 10,
    lastKnownVolumeRemain: 10,
    closed: false,
    watchedAt: now,
    updatedAt: now,
    ...overrides,
  });
}

beforeEach(async () => {
  await db.productionRuns.clear();
  await db.productionOrderWatches.clear();
});

describe('loadOrderCostBases', () => {
  it('computes unit cost per unit for a watched order', async () => {
    await addRun();
    await addWatch(8001);

    const result = await loadOrderCostBases(CHARACTER_ID, [8001]);

    expect(result.get(8001)).toEqual({
      unitCost: 32_000,
      runId: 'run-1',
      runQuantity: 10,
      materialCost: 300_000,
      jobFee: 20_000,
    });
  });

  it('omits an order with no linked watch', async () => {
    await addRun();
    await addWatch(8001);

    const result = await loadOrderCostBases(CHARACTER_ID, [8001, 9999]);

    expect(result.has(9999)).toBe(false);
    expect(result.has(8001)).toBe(true);
  });

  it('omits an order whose watch points at a missing run', async () => {
    await addWatch(8001, { runId: 'run-does-not-exist' });

    const result = await loadOrderCostBases(CHARACTER_ID, [8001]);

    expect(result.has(8001)).toBe(false);
  });

  it('omits an order whose run has a non-positive quantity, never dividing to Infinity', async () => {
    await addRun({ quantity: 0 });
    await addWatch(8001);

    const result = await loadOrderCostBases(CHARACTER_ID, [8001]);

    expect(result.has(8001)).toBe(false);
  });

  it('returns an empty map for an empty order id list', async () => {
    const result = await loadOrderCostBases(CHARACTER_ID, []);
    expect(result.size).toBe(0);
  });
});
