import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db, type ProductionRunRecord } from '@/db';
import { useRunCountsByPlan } from './useRunCountsByPlan';

const CHARACTER_ID = 1;

function run(overrides: Partial<ProductionRunRecord> = {}): ProductionRunRecord {
  return {
    id: crypto.randomUUID(),
    characterId: CHARACTER_ID,
    buildPlanId: 'plan-a',
    productTypeID: 587,
    quantity: 1,
    materialCost: 0,
    jobFee: 0,
    totalCost: 0,
    loggedAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('useRunCountsByPlan', () => {
  it('counts recorded runs per plan for the given character, live', async () => {
    await db.productionRuns.bulkAdd([
      run({ buildPlanId: 'plan-a' }),
      run({ buildPlanId: 'plan-a' }),
      run({ buildPlanId: 'plan-b' }),
      run({ characterId: 99, buildPlanId: 'plan-a' }),
    ]);

    const { result } = renderHook(() => useRunCountsByPlan(CHARACTER_ID));

    await waitFor(() => expect(result.current.get('plan-a')).toBe(2));
    expect(result.current.get('plan-b')).toBe(1);
    expect(result.current.has('plan-c')).toBe(false);
  });
});
