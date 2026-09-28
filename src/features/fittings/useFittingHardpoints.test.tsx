import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Fitting } from '@/engine/fittings/types';
import { ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';

const KIND: Record<number, 'turret' | 'launcher' | null> = {
  2889: 'turret',
  10631: 'launcher',
  3244: null,
};
let inFlight = 0;
let maxInFlight = 0;
// 99 stands for a type ESI couldn't supply.
vi.mock('./hardpointKinds', () => ({
  loadHardpointKind: async (typeId: number) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await Promise.resolve();
    inFlight -= 1;
    return typeId === 99 ? undefined : (KIND[typeId] ?? null);
  },
}));

const { useFittingHardpoints } = await import('./useFittingHardpoints');

const RIFTER: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [
    { slot: 'high', slotIndex: 0, typeId: 2889, state: 'active' },
    { slot: 'high', slotIndex: 1, typeId: 2889, state: 'active' },
    { slot: 'high', slotIndex: 2, typeId: 10631, state: 'active' },
    { slot: 'medium', slotIndex: 0, typeId: 3244, state: 'active' },
  ],
  drones: [],
  cargo: [],
};

const WITH_UNKNOWN: Fitting = {
  ...RIFTER,
  modules: [...RIFTER.modules, { slot: 'high', slotIndex: 3, typeId: 99, state: 'active' }],
};

describe('useFittingHardpoints', () => {
  it('counts the turrets and launchers the high slots take', async () => {
    const { result } = renderHook(() => useFittingHardpoints(RIFTER));
    await waitFor(() => expect(result.current).toEqual({ turrets: 2, launchers: 1 }));
  });

  it('stays unknown while a high-slot type can’t be fetched, rather than showing its pip free', async () => {
    const { result } = renderHook(() => useFittingHardpoints(WITH_UNKNOWN));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current).toBeNull();
  });

  it('is null with nothing open', () => {
    const { result } = renderHook(() => useFittingHardpoints(null));
    expect(result.current).toBeNull();
  });

  it('caps how many high-slot types it looks up at once (N+1 fan-out)', async () => {
    maxInFlight = 0;
    // More distinct high-slot types than the fan-out's concurrency cap, so an
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
    const { result } = renderHook(() => useFittingHardpoints(many));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(maxInFlight).toBeLessThanOrEqual(ESI_FANOUT_CONCURRENCY);
  });
});
