import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Fitting } from '@/engine/fittings/types';

const KIND: Record<number, 'turret' | 'launcher' | null> = {
  2889: 'turret',
  10631: 'launcher',
  3244: null,
};
vi.mock('./hardpointKinds', () => ({
  loadHardpointKind: async (typeId: number) => KIND[typeId] ?? null,
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

describe('useFittingHardpoints', () => {
  it('counts the turrets and launchers the high slots take', async () => {
    const { result } = renderHook(() => useFittingHardpoints(RIFTER));
    await waitFor(() => expect(result.current).toEqual({ turrets: 2, launchers: 1 }));
  });

  it('is null with nothing open', () => {
    const { result } = renderHook(() => useFittingHardpoints(null));
    expect(result.current).toBeNull();
  });
});
