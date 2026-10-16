import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSolarSystemList } from './useSolarSystems';

const sde = vi.hoisted(() => ({ loadSolarSystems: vi.fn() }));
vi.mock('@/sde/loadMarketSde', () => ({ loadSolarSystems: sde.loadSolarSystems }));

const JITA = { id: 30000142, name: 'Jita', security: 0.9, regionId: 10000002 };

beforeEach(() => sde.loadSolarSystems.mockReset());

describe('useSolarSystemList', () => {
  it('reports a failed read instead of an empty list, and retries by hand', async () => {
    sde.loadSolarSystems.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useSolarSystemList(true));
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.systems).toBeNull();

    sde.loadSolarSystems.mockResolvedValueOnce([JITA]);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.systems).toEqual([JITA]));
    expect(result.current.failed).toBe(false);
  });

  it('tries again by itself when the connection returns', async () => {
    sde.loadSolarSystems.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useSolarSystemList(true));
    await waitFor(() => expect(result.current.failed).toBe(true));

    sde.loadSolarSystems.mockResolvedValueOnce([JITA]);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(result.current.systems).toEqual([JITA]));
  });

  it('reads nothing until enabled', () => {
    renderHook(() => useSolarSystemList(false));
    expect(sde.loadSolarSystems).not.toHaveBeenCalled();
  });
});
