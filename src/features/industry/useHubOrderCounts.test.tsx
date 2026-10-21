import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchOrderCountsWithFallback as fetchOrderCounts } from '@/market/priceFallback';
import { getTradeHub } from '@/market/hubs';
import { hubOrderKey, useHubOrderCounts } from './useHubOrderCounts';

vi.mock('@/market/priceFallback', () => ({ fetchOrderCountsWithFallback: vi.fn() }));

const jita = getTradeHub('jita')!;

describe('useHubOrderCounts', () => {
  beforeEach(() => vi.mocked(fetchOrderCounts).mockReset());

  it('loads nothing while disabled', () => {
    const { result } = renderHook(() => useHubOrderCounts([{ hubId: 'jita', typeId: 34 }], false));
    expect(result.current).toMatchObject({ loading: false, failed: false });
    expect(fetchOrderCounts).not.toHaveBeenCalled();
  });

  it('reports loading, then the counts by hub and type', async () => {
    const value = { buy: 3, sell: 4 };
    vi.mocked(fetchOrderCounts).mockResolvedValue(new Map([[34, value]]) as never);
    const { result } = renderHook(() => useHubOrderCounts([{ hubId: 'jita', typeId: 34 }], true));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchOrderCounts).toHaveBeenCalledWith(jita.stationId, [34]);
    expect(result.current.counts.get(hubOrderKey('jita', 34))).toEqual(value);
  });

  it('flags a hub that cannot be read', async () => {
    const { result } = renderHook(() =>
      useHubOrderCounts([{ hubId: 'nowhere', typeId: 34 }], true)
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(true);
    expect(result.current.counts.size).toBe(0);
  });
});
