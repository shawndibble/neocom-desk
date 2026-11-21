import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { getHubPricesWithStatus } from '@/market/prices';
import { db } from '@/db';
import { resetHubStores } from '@/test/hubStores';
import { loadHaulPrices } from './haulPrices';

vi.mock('@/market/prices', () => ({ getHubPricesWithStatus: vi.fn() }));

const agg = (sellMin: number | null) => ({ sellMin, buyMax: null, sellVolume: 0, buyVolume: 0 });

describe('loadHaulPrices', () => {
  beforeEach(async () => {
    vi.mocked(getHubPricesWithStatus).mockReset();
    await db.settings.clear();
    resetHubStores();
  });

  it('prices each type at the Global hub sell price and leaves unpriced types out', async () => {
    vi.mocked(getHubPricesWithStatus).mockResolvedValue({
      prices: new Map([
        [34, agg(5)],
        [35, agg(null)],
      ]),
      unreachable: false,
      stale: false,
    });
    const result = await loadHaulPrices([34, 35, 34]);
    expect(getHubPricesWithStatus).toHaveBeenCalledWith(DEFAULT_TRADE_HUB, [34, 35]);
    expect([...result.unitIsk]).toEqual([[34, 5]]);
    expect(result.unavailable).toBe(false);
  });

  it('prices at the Assets page hub when it has one of its own', async () => {
    await db.settings.put({ key: 'sync.pageHubs', value: { assets: 'amarr' } });
    vi.mocked(getHubPricesWithStatus).mockResolvedValue({
      prices: new Map(),
      unreachable: false,
      stale: false,
    });
    await loadHaulPrices([34]);
    expect(getHubPricesWithStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'amarr' }),
      [34]
    );
  });

  it('reports unavailable when the price source could not be reached', async () => {
    vi.mocked(getHubPricesWithStatus).mockResolvedValue({
      prices: new Map([[34, agg(null)]]),
      unreachable: true,
      stale: false,
    });
    expect(await loadHaulPrices([34])).toEqual({ unitIsk: new Map(), unavailable: true });
  });

  it('asks for nothing when there is nothing to price', async () => {
    expect((await loadHaulPrices([])).unavailable).toBe(false);
    expect(getHubPricesWithStatus).not.toHaveBeenCalled();
  });
});
