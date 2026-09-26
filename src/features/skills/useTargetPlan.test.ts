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

    const added = await result.current.addEntries([{ skillTypeID: 100, targetLevel: 3 }], 'Vexor');

    await waitFor(async () => {
      const plans = await db.skillPlans.where('characterId').equals(CHARACTER_ID).toArray();
      expect(plans).toHaveLength(1);
      expect(plans[0].name).toBe('Vexor');
      expect(plans[0].entries).toEqual([{ skillTypeID: 100, targetLevel: 3 }]);
      expect(added).toEqual({
        planId: plans[0].id,
        planName: 'Vexor',
        added: [{ skillTypeID: 100, targetLevel: 3 }],
      });
    });
  });

  it('a repeat Add for a skill/level already in the plan is reported as not added (#1704)', async () => {
    const { result } = renderHook(() => useTargetPlan(CHARACTER_ID));
    await result.current.addEntries([{ skillTypeID: 100, targetLevel: 3 }], 'Vexor');

    const second = await result.current.addEntries(
      [
        { skillTypeID: 100, targetLevel: 3 },
        { skillTypeID: 200, targetLevel: 2 },
      ],
      'Vexor'
    );

    expect(second.added).toEqual([{ skillTypeID: 200, targetLevel: 2 }]);
  });

  it('removeEntries undoes exactly the given entries, leaving the rest of the plan (#1704)', async () => {
    const { result } = renderHook(() => useTargetPlan(CHARACTER_ID));
    const first = await result.current.addEntries([{ skillTypeID: 100, targetLevel: 3 }], 'Vexor');
    await result.current.addEntries([{ skillTypeID: 200, targetLevel: 2 }], 'Vexor');

    await result.current.removeEntries(first.planId, first.added);

    await waitFor(async () => {
      const plans = await db.skillPlans.where('characterId').equals(CHARACTER_ID).toArray();
      expect(plans[0].entries).toEqual([{ skillTypeID: 200, targetLevel: 2 }]);
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
