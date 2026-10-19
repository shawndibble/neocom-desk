import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SkillPlanRecord } from '@/db';

const schedulePlan = vi.fn();
vi.mock('./planSchedule', () => ({
  schedulePlan: (...args: unknown[]) => schedulePlan(...args),
}));
const cloneStore = { value: {}, hydrated: true, hydrate: async () => {} };
vi.mock('../cloneState', () => ({
  cloneStateFor: () => ({}),
  useCloneStates: (select: (s: unknown) => unknown) => select(cloneStore),
}));

import { usePlanStats, type PlanStatsInputs } from './usePlanStats';

const plan = (id: string) => ({ id }) as SkillPlanRecord;
const inputs = { trainedSkillsKnown: true } as unknown as PlanStatsInputs;

describe('usePlanStats', () => {
  beforeEach(() => {
    schedulePlan.mockReset();
    schedulePlan.mockReturnValue({ error: null, totalSeconds: 60, finish: null });
  });

  it('schedules every plan by default', () => {
    const { result } = renderHook(() => usePlanStats([plan('a'), plan('b')], inputs, 1));
    expect(schedulePlan).toHaveBeenCalledTimes(2);
    expect([...(result.current?.keys() ?? [])]).toEqual(['a', 'b']);
  });

  it('schedules only the plans named in onlyPlanIds', () => {
    const { result } = renderHook(() =>
      usePlanStats([plan('a'), plan('b'), plan('c')], inputs, 1, ['b'])
    );
    expect(schedulePlan).toHaveBeenCalledTimes(1);
    expect([...(result.current?.keys() ?? [])]).toEqual(['b']);
  });

  it('does not reschedule when onlyPlanIds is a new array with the same ids', () => {
    const plans = [plan('a'), plan('b')];
    const { rerender } = renderHook(() => usePlanStats(plans, inputs, 1, ['b']));
    rerender();
    expect(schedulePlan).toHaveBeenCalledTimes(1);
  });
});
