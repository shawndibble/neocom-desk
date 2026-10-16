import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
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
// 99998 starts unreadable and becomes readable (a reconnect); its result is cached once read.
let reconnectTypeReadable = false;
// 99999 stands for a type neither the cache nor ESI could supply.
const UNREADABLE_TYPE_ID = 99999;
// The baked typeInfo shard lacks every type here, so reads take the ESI fallback.
vi.mock('@/sde/loadTypeInfo', () => ({ loadTypeInfo: vi.fn(async () => null) }));
// typeId 587 (the hull) requires skillTypeID 3300 at level 5; everything else needs nothing.
vi.mock('@/features/skills/data', () => ({
  loadUniverseType: async (typeId: number) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight -= 1;
    if (typeId === 99999 || (typeId === 99998 && !reconnectTypeReadable)) return null;
    return {
      data: {
        dogma_attributes:
          typeId === 587
            ? [
                { attribute_id: 182, value: 3300 },
                { attribute_id: 277, value: 5 },
              ]
            : [],
      },
    };
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
        unknown: false,
      })
    );
  });

  it('reports unknown, not "nothing missing", when a fitted type could not be read', async () => {
    const unreadable: Fitting = {
      ...RIFTER,
      shipTypeId: 600,
      modules: [{ slot: 'high', slotIndex: 0, typeId: UNREADABLE_TYPE_ID, state: 'active' }],
    };
    const { result } = renderHook(() => useFittingSkillGaps(unreadable, 1));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toEqual({
      unusableModuleKeys: new Set(),
      missing: [],
      unknown: true,
    });
  });

  it('looks the unreadable type up again on reconnect and then stops reporting unknown', async () => {
    const unreadable: Fitting = {
      ...RIFTER,
      modules: [{ slot: 'high', slotIndex: 0, typeId: 99998, state: 'active' }],
    };
    const { result } = renderHook(() => useFittingSkillGaps(unreadable, 1));
    await waitFor(() => expect(result.current?.unknown).toBe(true));

    reconnectTypeReadable = true;
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(result.current?.unknown).toBe(false));
  });

  it('still lists the confirmed gaps when another type is unknown', async () => {
    const mixed: Fitting = {
      ...RIFTER,
      modules: [{ slot: 'high', slotIndex: 0, typeId: UNREADABLE_TYPE_ID, state: 'active' }],
    };
    const { result } = renderHook(() => useFittingSkillGaps(mixed, 1));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.missing).toEqual([{ skillTypeID: 3300, targetLevel: 5 }]);
    expect(result.current?.unknown).toBe(true);
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
