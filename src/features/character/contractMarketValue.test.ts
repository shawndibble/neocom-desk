import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import type { ContractItem } from '@/esi/endpoints';
import { loadContractMarketValue } from './contractMarketValue';

const pricesMock = vi.hoisted(() => ({ getHubPricesWithStatus: vi.fn() }));
vi.mock('@/market/prices', () => pricesMock);
const mutamarket = vi.hoisted(() => ({ getAbyssalEstimate: vi.fn() }));
vi.mock('@/market/mutamarket', () => mutamarket);

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

describe('loadContractMarketValue with abyssal modules', () => {
  const NEUT = 47832;
  const abyssal = { isAbyssalType: (typeId: number) => typeId === NEUT, characterId: 7 };
  const estimate = (value: number | null) => ({
    status: value === null ? 'no-estimate' : 'priced',
    value,
    source: 'mutamarket',
    fetchedAt: 0,
    valueUpdatedAt: null,
    url: 'https://mutamarket.com',
  });

  beforeEach(() => {
    pricesMock.getHubPricesWithStatus.mockResolvedValue({
      unreachable: false,
      prices: new Map([[TRITANIUM, { sellMin: 5, buyMax: 4, sellVolume: 0, buyVolume: 0 }]]),
    });
  });

  it('prices each abyssal module by its own estimate, apart from the market total', async () => {
    mutamarket.getAbyssalEstimate.mockImplementation(async (_type: number, itemId: number) =>
      estimate(itemId === 11 ? 90_000_000 : null)
    );
    const result = await loadContractMarketValue(
      DEFAULT_TRADE_HUB,
      [
        { type_id: TRITANIUM, quantity: 10 },
        { type_id: NEUT, quantity: 1, item_id: 11 },
        { type_id: NEUT, quantity: 1, item_id: 12 },
        { type_id: NEUT, quantity: 1 },
      ],
      new Map(),
      { abyssal }
    );
    expect(result).toEqual({
      total: 50,
      unpriced: 0,
      unreachable: false,
      abyssal: { estimated: 90_000_000, priced: 1, unpriced: 2, onlyAbyssal: false },
    });
    expect(pricesMock.getHubPricesWithStatus.mock.calls[0][1]).toEqual([TRITANIUM]);
    expect(mutamarket.getAbyssalEstimate).toHaveBeenCalledTimes(2);
    expect(mutamarket.getAbyssalEstimate).toHaveBeenCalledWith(NEUT, 11, { characterId: 7 });
  });

  it('leaves abyssal lines unpriced without an item id or a Character, and reads no prices for them', async () => {
    const result = await loadContractMarketValue(
      DEFAULT_TRADE_HUB,
      [{ type_id: NEUT, quantity: 1, item_id: 11 }],
      new Map(),
      { abyssal: { ...abyssal, characterId: null } }
    );
    expect(result.abyssal).toEqual({ estimated: 0, priced: 0, unpriced: 1, onlyAbyssal: true });
    expect(pricesMock.getHubPricesWithStatus).not.toHaveBeenCalled();
    expect(mutamarket.getAbyssalEstimate).not.toHaveBeenCalled();
  });

  it('stops looking up once MutaMarket is unavailable', async () => {
    mutamarket.getAbyssalEstimate.mockResolvedValue({ ...estimate(null), status: 'unavailable' });
    const lines = Array.from({ length: 12 }, (_, i) => ({
      type_id: NEUT,
      quantity: 1,
      item_id: 100 + i,
    }));
    const result = await loadContractMarketValue(DEFAULT_TRADE_HUB, lines, new Map(), { abyssal });
    expect(mutamarket.getAbyssalEstimate.mock.calls.length).toBeLessThanOrEqual(4);
    expect(result.abyssal).toEqual({ estimated: 0, priced: 0, unpriced: 12, onlyAbyssal: true });
  });

  it('starts no lookup once the view is closed', async () => {
    const result = await loadContractMarketValue(
      DEFAULT_TRADE_HUB,
      [{ type_id: NEUT, quantity: 1, item_id: 11 }],
      new Map(),
      { abyssal: { ...abyssal, isCancelled: () => true } }
    );
    expect(mutamarket.getAbyssalEstimate).not.toHaveBeenCalled();
    expect(result.abyssal?.unpriced).toBe(1);
  });
});
