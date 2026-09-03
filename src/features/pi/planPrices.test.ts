import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRADE_HUBS } from '@/market/hubs';

const loadMarketSnapshot = vi.fn();
vi.mock('@/features/industry/marketData', () => ({
  loadMarketSnapshot: (...args: unknown[]) => loadMarketSnapshot(...args),
}));

const { loadPlanPrices } = await import('./planPrices');

beforeEach(() => {
  loadMarketSnapshot.mockReset();
});

describe('loadPlanPrices', () => {
  it('asks the shared market path once, for every type the chain can involve', async () => {
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: { 2867: 1_900_000, 2389: 760 },
      adjustedPrices: null,
      systemCostIndex: null,
    });

    const result = await loadPlanPrices(TRADE_HUBS[0], [2867, 2389, 2867]);

    expect(loadMarketSnapshot).toHaveBeenCalledTimes(1);
    const [hub, typeIds] = loadMarketSnapshot.mock.calls[0] as [unknown, number[]];
    expect(hub).toBe(TRADE_HUBS[0]);
    // De-duplicated: a chain names the same tier from several parents.
    expect([...typeIds].sort((a, b) => a - b)).toEqual([2389, 2867]);
    expect(result.prices).toEqual({ 2867: 1_900_000, 2389: 760 });
  });

  it('leaves an unquoted type out of the map rather than pricing it at zero', async () => {
    loadMarketSnapshot.mockResolvedValue({
      hubPrices: { 2867: 1_900_000 },
      adjustedPrices: null,
      systemCostIndex: null,
    });

    const result = await loadPlanPrices(TRADE_HUBS[0], [2867, 2389]);

    expect(result.prices[2389]).toBeUndefined();
    expect(result.unpriced).toEqual([2389]);
  });

  it('degrades to no prices at all rather than throwing when the hub is unreachable', async () => {
    loadMarketSnapshot.mockRejectedValue(new Error('fuzzwork is down'));

    const result = await loadPlanPrices(TRADE_HUBS[0], [2867]);

    expect(result.prices).toEqual({});
    expect(result.failed).toBe(true);
    expect(result.unpriced).toEqual([2867]);
  });

  it('does nothing at all when there is nothing to price', async () => {
    const result = await loadPlanPrices(TRADE_HUBS[0], []);

    expect(loadMarketSnapshot).not.toHaveBeenCalled();
    expect(result.prices).toEqual({});
    expect(result.failed).toBe(false);
  });
});
