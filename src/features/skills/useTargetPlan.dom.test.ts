import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { db } from '@/db';
import { useTargetPlan, type TargetPlan } from './useTargetPlan';

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

  describe('removeEntries keeps Remap Markers anchored (#2051)', () => {
    const OVERRIDE = { intelligence: 27, memory: 21, perception: 17, willpower: 17, charisma: 17 };

    async function planWithMarkerAt(position: number): Promise<{
      planId: string;
      removeEntries: TargetPlan['removeEntries'];
    }> {
      const { result } = renderHook(() => useTargetPlan(CHARACTER_ID));
      const { planId } = await result.current.addEntries(
        [
          { skillTypeID: 100, targetLevel: 1 },
          { skillTypeID: 200, targetLevel: 1 },
          { skillTypeID: 300, targetLevel: 1 },
        ],
        'Vexor'
      );
      await db.skillPlans.update(planId, { markers: [position], markerAttributes: [OVERRIDE] });
      return { planId, removeEntries: result.current.removeEntries };
    }

    it('removing an entry before a marker moves the marker and its override back one', async () => {
      const { planId, removeEntries } = await planWithMarkerAt(2);

      await removeEntries(planId, [{ skillTypeID: 100, targetLevel: 1 }]);

      const plan = await db.skillPlans.get(planId);
      expect(plan?.entries.map((e) => e.skillTypeID)).toEqual([200, 300]);
      expect(plan?.markers).toEqual([1]);
      expect(plan?.markerAttributes).toEqual([OVERRIDE]);
    });

    it('removing an entry after a marker leaves the marker where it is', async () => {
      const { planId, removeEntries } = await planWithMarkerAt(1);

      await removeEntries(planId, [{ skillTypeID: 300, targetLevel: 1 }]);

      const plan = await db.skillPlans.get(planId);
      expect(plan?.entries.map((e) => e.skillTypeID)).toEqual([100, 200]);
      expect(plan?.markers).toEqual([1]);
      expect(plan?.markerAttributes).toEqual([OVERRIDE]);
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
