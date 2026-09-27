import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Fitting } from '@/engine/fittings/types';
import type { PilotProfile } from '@/engine/fittings/types';
import { ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';

const PROFILE: PilotProfile = {
  skillLevels: new Map([[3300, 3]]),
  implantTypeIds: [],
  boosterTypeIds: [],
};
vi.mock('./fittingPilotProfile', () => ({
  loadActivePilotProfile: async () => PROFILE,
}));

let inFlight = 0;
let maxInFlight = 0;
// typeId 587 (the hull) requires skillTypeID 3300 at level 5; everything else needs nothing.
vi.mock('./skillRequirements', () => ({
  loadRequirements: async (typeId: number) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight -= 1;
    return typeId === 587 ? [{ skillTypeID: 3300, level: 5 }] : [];
  },
}));

const { useFittingSkillGaps } = await import('./useFittingSkillGaps');

const RIFTER: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 2889, state: 'active' }],
  drones: [],
  cargo: [],
};

describe('useFittingSkillGaps', () => {
  it('reports the skill the pilot lacks for the hull', async () => {
    const { result } = renderHook(() => useFittingSkillGaps(RIFTER, 1));
    await waitFor(() =>
      expect(result.current).toEqual({
        unusableModuleKeys: new Set(),
        missing: [{ skillTypeID: 3300, targetLevel: 5 }],
      })
    );
  });

  it('is null with nothing open or no active Character', () => {
    expect(renderHook(() => useFittingSkillGaps(null, 1)).result.current).toBeNull();
    expect(renderHook(() => useFittingSkillGaps(RIFTER, null)).result.current).toBeNull();
  });

  it('caps how many fitted types it looks up requirements for at once (N+1 fan-out)', async () => {
    maxInFlight = 0;
    // More distinct types than the fan-out's concurrency cap, so an
    // unbounded `Promise.all` would fire them all at once.
    const many: Fitting = {
      ...RIFTER,
      modules: Array.from({ length: ESI_FANOUT_CONCURRENCY + 5 }, (_, index) => ({
        slot: 'high' as const,
        slotIndex: index,
        typeId: 20000 + index,
        state: 'active' as const,
      })),
    };
    const { result } = renderHook(() => useFittingSkillGaps(many, 1));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(maxInFlight).toBeLessThanOrEqual(ESI_FANOUT_CONCURRENCY);
  });
});
