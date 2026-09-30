import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { FittingStats } from '@/engine/fittings/types';
import type { SkillGain } from '@/engine/fittings/skillGains';
import type { SkillGainEvaluator } from './useFittingEvaluation';
import { useSkillLevelGain } from './useSkillLevelGain';

// The scoring itself is `skillGains.test.ts`'s; here it only has to be told apart by level.
vi.mock('@/engine/fittings/skillGains', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/fittings/skillGains')>()),
  levelGain: (before: { ehp: number }, after: { ehp: number }) => ({
    delta: { changes: [], count: 0 },
    roleChanges: [],
    metrics: { overall: after.ehp - before.ehp },
  }),
}));

function stats(ehp: number): FittingStats {
  return { ehp } as unknown as FittingStats;
}

const gain = {
  skillTypeId: 7,
  fromLevel: 1,
  toLevel: 2,
  delta: { changes: [], count: 0 },
  roleChanges: [],
  metrics: { overall: 0 },
} as unknown as SkillGain;

function evaluator(compare: SkillGainEvaluator['compare']): SkillGainEvaluator {
  return { compare } as unknown as SkillGainEvaluator;
}

describe('useSkillLevelGain', () => {
  it('hands back the ranked level as it is, without a calculation', () => {
    const compare = vi.fn();
    const ev = evaluator(compare);
    const { result } = renderHook(() => useSkillLevelGain(ev, gain, 2));
    expect(result.current).toBe(gain);
    expect(compare).not.toHaveBeenCalled();
  });

  it('works out another level on demand: null while working, then its changes', async () => {
    const compare = vi.fn(async (_skill: number, level: number) => ({
      before: stats(1000),
      after: stats(1000 + level * 100),
    }));
    const ev = evaluator(compare);
    const { result } = renderHook(() => useSkillLevelGain(ev, gain, 4));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(compare).toHaveBeenCalledWith(7, 4);
    expect(result.current?.metrics.overall).toBe(400);
  });

  it("never shows one level's figures for another, nor a previous evaluator's", async () => {
    const compare = vi.fn(async (_skill: number, level: number) => ({
      before: stats(1000),
      after: stats(1000 + level * 100),
    }));
    const first = evaluator(compare);
    const { result, rerender } = renderHook(({ ev, level }) => useSkillLevelGain(ev, gain, level), {
      initialProps: { ev: first, level: 3 },
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ ev: first, level: 5 });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ ev: evaluator(compare), level: 5 });
    expect(result.current).toBeNull();
  });

  it('stays null when the calculation throws', async () => {
    const compare = vi.fn(async () => {
      throw new Error('engine');
    });
    const ev = evaluator(compare);
    const { result } = renderHook(() => useSkillLevelGain(ev, gain, 4));
    await waitFor(() => expect(compare).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
