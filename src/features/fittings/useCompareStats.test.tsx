import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { DamageProfile, Fitting, FittingStats, PilotProfile } from '@/engine/fittings/types';
import { useCompareStats } from './useCompareStats';

const computeFittingStats = vi.fn(
  async (_f: Fitting, _p: PilotProfile, _progress: unknown, damage?: DamageProfile) =>
    ({ tag: damage?.em }) as unknown as FittingStats
);
vi.mock('./dogmaFittingEngine', () => ({
  computeFittingStats: (f: Fitting, p: PilotProfile, progress: unknown, damage?: DamageProfile) =>
    computeFittingStats(f, p, progress, damage),
}));

const profile = { skillLevels: new Map() } as unknown as PilotProfile;
const fit = { name: 'a' } as unknown as Fitting;
const emProfile: DamageProfile = { em: 1, thermal: 0, kinetic: 0, explosive: 0 };
const kinProfile: DamageProfile = { em: 0.25, thermal: 0.25, kinetic: 0.25, explosive: 0.25 };

describe('useCompareStats', () => {
  it('waits for a Damage Profile, then recomputes when it changes', async () => {
    const fittings = [fit];
    const { result, rerender } = renderHook(({ dp }) => useCompareStats(fittings, profile, dp), {
      initialProps: { dp: null as DamageProfile | null },
    });
    expect(computeFittingStats).not.toHaveBeenCalled();
    rerender({ dp: emProfile });
    await waitFor(() => expect(result.current.values[0]).toEqual({ tag: 1 }));
    rerender({ dp: kinProfile });
    await waitFor(() => expect(result.current.values[0]).toEqual({ tag: 0.25 }));
  });
});
