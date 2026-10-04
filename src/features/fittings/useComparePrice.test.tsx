import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Fitting, PilotProfile } from '@/engine/fittings/types';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { useComparePrice } from './useComparePrice';

const loadFittingPrice = vi.fn(async (..._args: unknown[]) => ({
  totals: { sell: 10, buy: 5 },
}));
vi.mock('./fittingPrice', () => ({
  loadFittingPrice: (...args: unknown[]) => loadFittingPrice(...args),
}));

const fit = { name: 'a' } as unknown as Fitting;

beforeEach(() => loadFittingPrice.mockClear());

describe('useComparePrice', () => {
  it("passes the pilot's active-clone implants so the price leaves them out", async () => {
    const profile = { implantTypeIds: [100, 200] } as unknown as PilotProfile;
    const fittings = [fit];
    const { result } = renderHook(() => useComparePrice(fittings, profile));
    await waitFor(() => expect(result.current.values[0]).toEqual({ sell: 10, buy: 5 }));
    expect(loadFittingPrice).toHaveBeenCalledWith(fit, DEFAULT_TRADE_HUB, [100, 200]);
  });
});
