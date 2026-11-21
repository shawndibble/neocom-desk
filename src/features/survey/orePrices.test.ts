import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { loadOrePrices } from './orePrices';

vi.mock('@/features/miningTax/pricing', () => ({
  oreUnitPrices: vi.fn(async () => ({
    prices: new Map([['Veldspar', 20]]),
    compressed: true,
  })),
}));

describe('loadOrePrices', () => {
  it('prices ore at the Mining price percent', async () => {
    const { prices } = await loadOrePrices(['Veldspar'], DEFAULT_TRADE_HUB, 90);
    expect(prices.get('Veldspar')).toBe(18);
  });

  it('prices at market with no percent', async () => {
    const { prices } = await loadOrePrices(['Veldspar'], DEFAULT_TRADE_HUB);
    expect(prices.get('Veldspar')).toBe(20);
  });
});
