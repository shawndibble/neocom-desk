import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCheaperNearbySystems } from './useCheaperNearbySystems';
import { loadNpcIndustrySystems } from '@/market/industryFacilities';

vi.mock('@/sde/jumpGraph', () => ({
  loadJumpGraph: async () =>
    new Map<number, readonly number[]>([
      [1, [2, 3]],
      [2, [1]],
      [3, [1]],
    ]),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () =>
    new Map([
      [1, { name: 'Home', security: 0.9 }],
      [2, { name: 'Alpha', security: 0.9 }],
      [3, { name: 'Beta', security: 0.4 }],
    ]),
}));
vi.mock('./marketData', () => ({
  loadSystemCostIndices: async () =>
    new Map([
      [1, 0.05],
      [2, 0.01],
      [3, 0.02],
    ]),
}));
vi.mock('@/market/industryFacilities', () => ({ loadNpcIndustrySystems: vi.fn() }));

const npcSystems = vi.mocked(loadNpcIndustrySystems);

describe('useCheaperNearbySystems', () => {
  beforeEach(() => npcSystems.mockReset());

  it('drops systems with no NPC industry station and flags the rest', async () => {
    npcSystems.mockResolvedValue(new Set([3]));
    const { result } = renderHook(() => useCheaperNearbySystems(1, 'manufacturing', 0.05));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0]).toMatchObject({ name: 'Beta', npcStation: true });
  });

  it('shows every cheaper system, unflagged, when the facility list cannot be read', async () => {
    npcSystems.mockResolvedValue(null);
    const { result } = renderHook(() => useCheaperNearbySystems(1, 'manufacturing', 0.05));
    await waitFor(() => expect(result.current).toHaveLength(2));
    expect(result.current.map((row) => row.npcStation)).toEqual([false, false]);
  });

  it('does not filter or flag a reaction plan', async () => {
    const { result } = renderHook(() => useCheaperNearbySystems(1, 'reaction', 0.05));
    // Alpha is highsec, which cannot run a reaction; Beta (lowsec) stays, unflagged.
    await waitFor(() => expect(result.current.map((row) => row.name)).toEqual(['Beta']));
    expect(result.current[0].npcStation).toBe(false);
    expect(npcSystems).not.toHaveBeenCalled();
  });
});
