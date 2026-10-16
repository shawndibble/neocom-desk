import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { ContractItem } from '@/esi/endpoints';
import { loadContractMarketValue } from './contractMarketValue';

const pricesMock = vi.hoisted(() => ({ getHubPricesWithStatus: vi.fn() }));
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
    pricesMock.getHubPricesWithStatus.mockResolvedValue({
      unreachable: false,
      prices: new Map([
        [TRITANIUM, { sellMin: 5, buyMax: 4, sellVolume: 0, buyVolume: 0 }],
        [PYERITE, { sellMin: 10, buyMax: 8, sellVolume: 0, buyVolume: 0 }],
      ]),
    });

    const result = await loadContractMarketValue(
      DEFAULT_TRADE_HUB,
      [item({ type_id: TRITANIUM, quantity: 100 }), item({ type_id: PYERITE, quantity: 10 })],
      new Map([
        [TRITANIUM, 'Tritanium'],
        [PYERITE, 'Pyerite'],
      ])
    );

    expect(result).toEqual({ total: 5 * 100 + 10 * 10, unpriced: 0, unreachable: false });
  });

  it('leaves an unpriced line out of the total and counts it, not as free', async () => {
    pricesMock.getHubPricesWithStatus.mockResolvedValue({
      unreachable: false,
      prices: new Map([[TRITANIUM, { sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 }]]),
    });

    const result = await loadContractMarketValue(
      DEFAULT_TRADE_HUB,
      [item({ type_id: TRITANIUM, quantity: 100 })],
      new Map([[TRITANIUM, 'Tritanium']])
    );

    expect(result).toEqual({ total: 0, unpriced: 1, unreachable: false });
  });

  it('flags unreachable when the price source could not be reached', async () => {
    pricesMock.getHubPricesWithStatus.mockResolvedValue({
      unreachable: true,
      prices: new Map([[TRITANIUM, { sellMin: null, buyMax: null, sellVolume: 0, buyVolume: 0 }]]),
    });

    const result = await loadContractMarketValue(
      DEFAULT_TRADE_HUB,
      [item({ type_id: TRITANIUM, quantity: 100 })],
      new Map([[TRITANIUM, 'Tritanium']])
    );

    expect(result).toEqual({ total: 0, unpriced: 1, unreachable: true });
  });

  it('queries prices at the given hub for every line typeId', async () => {
    pricesMock.getHubPricesWithStatus.mockResolvedValue({ prices: new Map(), unreachable: false });

    await loadContractMarketValue(
      DEFAULT_TRADE_HUB,
      [item({ type_id: TRITANIUM }), item({ type_id: PYERITE })],
      new Map()
    );

    expect(pricesMock.getHubPricesWithStatus).toHaveBeenCalledWith(DEFAULT_TRADE_HUB, [
      TRITANIUM,
      PYERITE,
    ]);
  });
});
