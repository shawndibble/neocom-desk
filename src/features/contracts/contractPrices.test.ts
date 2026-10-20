import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';

const getHubPricesWithStatus = vi.fn();
const loadHubSnapshotRange = vi.fn();
vi.mock('@/market/prices', () => ({
  getHubPricesWithStatus: (...args: unknown[]) => getHubPricesWithStatus(...args),
}));
vi.mock('@/features/market/hubSnapshot', () => ({
  loadHubSnapshotRange: (...args: unknown[]) => loadHubSnapshotRange(...args),
}));

import { loadContractPrices } from './contractPrices';

beforeEach(() => {
  getHubPricesWithStatus.mockReset();
  loadHubSnapshotRange.mockReset();
});

describe('loadContractPrices', () => {
  it('reads the live book for a live basis: best buy and lowest sell per type', async () => {
    getHubPricesWithStatus.mockResolvedValue({
      prices: new Map([[28434, { buyMax: 12_300, sellMin: 13_100 }]]),
      unreachable: false,
    });
    const result = await loadContractPrices(DEFAULT_TRADE_HUB, [28434, 28434], { kind: 'live' });
    expect(getHubPricesWithStatus).toHaveBeenCalledWith(DEFAULT_TRADE_HUB, [28434]);
    expect(result.prices.get(28434)).toEqual({ buy: 12_300, sell: 13_100 });
    expect(result.unreachable).toBe(false);
  });

  it('carries the unreachable flag so an empty result reads as unknown, not worthless', async () => {
    getHubPricesWithStatus.mockResolvedValue({ prices: new Map(), unreachable: true });
    const result = await loadContractPrices(DEFAULT_TRADE_HUB, [28434], { kind: 'live' });
    expect(result.unreachable).toBe(true);
  });

  it('reads the hub station Open Price of the issue day for a day basis', async () => {
    loadHubSnapshotRange.mockResolvedValue({
      saved: new Map([['2026-10-17', new Map([[28434, { buy: 12_300, sell: 13_100 }]])]]),
      historical: new Map(),
    });
    const result = await loadContractPrices(DEFAULT_TRADE_HUB, [28434, 28433], {
      kind: 'day',
      date: '2026-10-17',
    });
    expect(loadHubSnapshotRange).toHaveBeenCalledWith(
      '2026-10-17',
      '2026-10-17',
      [28434, 28433],
      DEFAULT_TRADE_HUB
    );
    expect(result.prices.get(28434)).toEqual({ buy: 12_300, sell: 13_100 });
    expect(result.prices.has(28433)).toBe(false);
  });

  it('ignores the region-wide historical tier: the panel says the hub station, so it only uses the station', async () => {
    loadHubSnapshotRange.mockResolvedValue({
      saved: new Map(),
      historical: new Map([['2026-10-17', new Map([[28434, { buy: 1, sell: 2 }]])]]),
    });
    const result = await loadContractPrices(DEFAULT_TRADE_HUB, [28434], {
      kind: 'day',
      date: '2026-10-17',
    });
    expect(result.prices.size).toBe(0);
  });

  it('prices a type the hub never lists, such as PLEX, from the sell override', async () => {
    getHubPricesWithStatus.mockResolvedValue({ prices: new Map(), unreachable: false });
    const result = await loadContractPrices(
      DEFAULT_TRADE_HUB,
      [44992],
      { kind: 'live' },
      new Map([[44992, 5_000_000]])
    );
    expect(result.prices.get(44992)).toEqual({ buy: null, sell: 5_000_000 });
  });

  it("does not price a past day from the live override: today's PLEX price is not that day's", async () => {
    loadHubSnapshotRange.mockResolvedValue({ saved: new Map(), historical: new Map() });
    const result = await loadContractPrices(
      DEFAULT_TRADE_HUB,
      [44992],
      { kind: 'day', date: '2026-10-17' },
      new Map([[44992, 5_000_000]])
    );
    expect(result.prices.has(44992)).toBe(false);
  });
});
