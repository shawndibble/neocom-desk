import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { useTargetPlan } from './useTargetPlan';

const CHARACTER_ID = 777;

afterEach(async () => {
  await db.skillPlans.clear();
});

describe('useTargetPlan', () => {
  it('creates a plan named after the fit and adds the entries to it', async () => {
    const { result } = renderHook(() => useTargetPlan(CHARACTER_ID));

    await result.current.addEntries([{ skillTypeID: 100, targetLevel: 3 }], 'Vexor');

    await waitFor(async () => {
      const plans = await db.skillPlans.where('characterId').equals(CHARACTER_ID).toArray();
      expect(plans).toHaveLength(1);
      expect(plans[0].name).toBe('Vexor');
      expect(plans[0].entries).toEqual([{ skillTypeID: 100, targetLevel: 3 }]);
    });
  });

  it('two concurrent Add calls with no plan yet merge into one plan, not two (#1366)', async () => {
    const { result } = renderHook(() => useTargetPlan(CHARACTER_ID));

    await Promise.all([
      result.current.addEntries([{ skillTypeID: 100, targetLevel: 3 }], 'Vexor'),
      result.current.addEntries([{ skillTypeID: 200, targetLevel: 2 }], 'Vexor'),
    ]);

    await waitFor(async () => {
      const plans = await db.skillPlans.where('characterId').equals(CHARACTER_ID).toArray();
      expect(plans).toHaveLength(1);
      expect(plans[0].entries.map((e) => e.skillTypeID).sort()).toEqual([100, 200]);
    });
  });
});
