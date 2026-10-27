import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { FittingStats } from '@/engine/fittings/types';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { useSkillFixes } from './useSkillFixes';

const stats = (cpuUsed: number) =>
  ({
    cpuUsed,
    cpuTotal: 100,
    powergridUsed: 0,
    powergridTotal: 100,
    calibrationUsed: 0,
    calibrationTotal: 400,
  }) as unknown as FittingStats;

/** Over by 20; each listed skill frees 5 CPU a level, so III fits. */
function evaluator(skills: number[]) {
  const compareTrained = vi.fn(
    async (_fitting: unknown, trained: readonly { targetLevel: number }[]) => ({
      before: stats(120),
      after: stats(120 - 5 * (trained[0]?.targetLevel ?? 0)),
    })
  );
  return {
    compareTrained,
    value: {
      fitting: {},
      profile: { skillLevels: new Map() },
      skillSources: async () => skills,
      compareTrained,
    } as unknown as SkillGainEvaluator,
  };
}

describe('useSkillFixes', () => {
  it('shares one run between two askers of the same evaluator', async () => {
    const { value, compareTrained } = evaluator([1]);
    const first = renderHook(() => useSkillFixes(value, true));
    const second = renderHook(() => useSkillFixes(value, true));
    await waitFor(() => expect(first.result.current.fixes).toHaveLength(1));
    await waitFor(() => expect(second.result.current.fixes).toHaveLength(1));
    expect(first.result.current.fixes![0]!.entries).toEqual([{ skillTypeID: 1, targetLevel: 4 }]);
    const calls = compareTrained.mock.calls.length;
    renderHook(() => useSkillFixes(value, true));
    expect(compareTrained.mock.calls.length).toBe(calls);
  });

  it('stops the run once its last asker leaves', async () => {
    const { value, compareTrained } = evaluator(Array.from({ length: 50 }, (_, i) => i + 1));
    const { unmount } = renderHook(() => useSkillFixes(value, true));
    await waitFor(() => expect(compareTrained).toHaveBeenCalled());
    unmount();
    const calls = compareTrained.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    // At most the calculation already under way finishes.
    expect(compareTrained.mock.calls.length).toBeLessThanOrEqual(calls + 1);
    expect(calls).toBeLessThan(50);
  });

  it('runs nothing while not enabled', () => {
    const { value, compareTrained } = evaluator([1]);
    const { result } = renderHook(() => useSkillFixes(value, false));
    expect(result.current.fixes).toBeNull();
    expect(compareTrained).not.toHaveBeenCalled();
  });
});
