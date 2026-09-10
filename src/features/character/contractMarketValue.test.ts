import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { ContractItem } from '@/esi/endpoints';
import { loadContractMarketValue } from './contractMarketValue';

const pricesMock = vi.hoisted(() => ({ getHubPrices: vi.fn() }));
vi.mock('@/market/prices', () => pricesMock);

const TRITANIUM = 34;
const PYERITE = 35;

function item(overrides: Partial<ContractItem>): ContractItem {
  return {
    record_id: 1,
    type_id: TRITANIUM,
    quantity: 1,
    is_included: true,
    is_singleton: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('loadContractMarketValue', () => {
  it('sums quantity times sell price for each priced line', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([
        [TRITANIUM, { sellMin: 5, buyMax: 4, sellVolume: 0, buyVolume: 0 }],
        [PYERITE, { sellMin: 10, buyMax: 8, sellVolume: 0, buyVolume: 0 }],
      ])
    );

    const result = await loadContractMarketValue(
      DEFAULT_TRADE_HUB,
      [item({ type_id: TRITANIUM, quantity: 100 }), item({ type_id: PYERITE, quantity: 10 })],
      new Map([
        [TRITANIUM, 'Tritanium'],
        [PYERITE, 'Pyerite'],
      ])
    );

    expect(result).toEqual({ total: 5 * 100 + 10 * 10, unpriced: 0 });
  });

  it('leaves an unpriced line out of the total and counts it, not as free', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[TRITANIUM, { sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 }]])
    );

    const result = await loadContractMarketValue(
      DEFAULT_TRADE_HUB,
      [item({ type_id: TRITANIUM, quantity: 100 })],
      new Map([[TRITANIUM, 'Tritanium']])
    );

    expect(result).toEqual({ total: 0, unpriced: 1 });
  });

  it('queries prices at the given hub for every line typeId', async () => {
    pricesMock.getHubPrices.mockResolvedValue(new Map());

    await loadContractMarketValue(
      DEFAULT_TRADE_HUB,
      [item({ type_id: TRITANIUM }), item({ type_id: PYERITE })],
      new Map()
    );

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(DEFAULT_TRADE_HUB, [TRITANIUM, PYERITE]);
  });
});
