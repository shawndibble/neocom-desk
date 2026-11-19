import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { RegionOrder } from '@/esi/endpoints';
import { useBookStationMap } from './useBookStationMap';

const loadName = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/structures', () => ({ loadStructureNameNoRoster: loadName }));

const STRUCTURE = 1_040_000_000_001;
const NPC = 60_003_760;
const sde = new Map([[NPC, { name: 'Jita IV - Moon 4', systemId: 30000142 }]]);

const order = (location_id: number, system_id: number) =>
  ({ order_id: location_id, location_id, system_id }) as RegionOrder;

beforeEach(() => loadName.mockReset());

describe('useBookStationMap', () => {
  it('names a player structure from its order system, keeping NPC stations', async () => {
    loadName.mockResolvedValue('Keepstar One');
    const sell = [order(NPC, 30000142), order(STRUCTURE, 30002187)];
    const { result } = renderHook(() => useBookStationMap(sde, 7, sell, []));
    await waitFor(() => expect(result.current.get(STRUCTURE)?.name).toBe('Keepstar One'));
    expect(result.current.get(STRUCTURE)?.systemId).toBe(30002187);
    expect(result.current.get(NPC)?.name).toBe('Jita IV - Moon 4');
    expect(loadName).toHaveBeenCalledTimes(1);
    expect(loadName).toHaveBeenCalledWith(7, STRUCTURE);
  });

  it('leaves a refused structure unnamed and never asks for an NPC station', async () => {
    loadName.mockResolvedValue(null);
    const { result } = renderHook(() =>
      useBookStationMap(sde, 7, [order(NPC, 1), order(STRUCTURE, 2)], [])
    );
    await waitFor(() => expect(loadName).toHaveBeenCalled());
    expect(result.current.has(STRUCTURE)).toBe(false);
    expect(result.current).toBe(sde);
  });

  it('asks nothing with no character', () => {
    renderHook(() => useBookStationMap(sde, null, [order(STRUCTURE, 2)], []));
    expect(loadName).not.toHaveBeenCalled();
  });
});
