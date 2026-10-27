import { describe, expect, it, vi } from 'vitest';
import { loadFittingPrice } from './fittingPrice';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { Fitting } from '@/engine/fittings/types';

const getHubPricesMock = vi.fn();
vi.mock('@/market/prices', () => ({
  getHubPrices: (...args: unknown[]) => getHubPricesMock(...args),
}));

const fitting: Fitting = {
  name: 'Rifter',
  shipTypeId: 587,
  modules: [{ slot: 'high', slotIndex: 0, typeId: 2456, state: 'active', chargeTypeId: 12608 }],
  drones: [{ typeId: 2454, quantity: 2, state: 'active' }],
  cargo: [],
};

describe('loadFittingPrice', () => {
  it('prices the hull, every module, a loaded charge once, and a drone stack by its full count', async () => {
    getHubPricesMock.mockResolvedValue(
      new Map([
        [587, { buyMax: 500000, sellMin: 600000 }],
        [2456, { buyMax: 1000, sellMin: 1500 }],
        [12608, { buyMax: 10, sellMin: 12 }],
        [2454, { buyMax: 20000, sellMin: 25000 }],
      ])
    );

    const appraisal = await loadFittingPrice(fitting, DEFAULT_TRADE_HUB);

    expect(getHubPricesMock).toHaveBeenCalledWith(
      DEFAULT_TRADE_HUB,
      expect.arrayContaining([587, 2456, 12608, 2454])
    );
    // hull 500000 + module 1000 + charge 10 + 2x drone 40000 = 541010
    expect(appraisal.totals.buy).toBe(541010);
    // hull 600000 + module 1500 + charge 12 + 2x drone 50000 = 651512
    expect(appraisal.totals.sell).toBe(651512);
    expect(appraisal.totals.unpricedRows).toBe(0);
  });

  it('leaves an unpriced type out of the totals and counts it', async () => {
    getHubPricesMock.mockResolvedValue(new Map());

    const appraisal = await loadFittingPrice(fitting, DEFAULT_TRADE_HUB);

    expect(appraisal.totals.buy).toBe(0);
    expect(appraisal.totals.sell).toBe(0);
    expect(appraisal.totals.unpricedRows).toBe(4);
  });
});
