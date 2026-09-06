import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadJitaUnitPrices } from './pricing';

const ZEOLITES = 45490;
const COMPRESSED_ZEOLITES = 62463;
const VELDSPAR = 1230; // no compressed pairing seeded — prices as itself

const pricesMock = vi.hoisted(() => ({ getHubPrices: vi.fn() }));
vi.mock('@/market/prices', () => pricesMock);

const sdeMock = vi.hoisted(() => ({ loadCompressedOreTypeIds: vi.fn() }));
vi.mock('@/sde/loadSde', () => sdeMock);

beforeEach(() => {
  vi.clearAllMocks();
  sdeMock.loadCompressedOreTypeIds.mockResolvedValue({ [ZEOLITES]: COMPRESSED_ZEOLITES });
});

describe('loadJitaUnitPrices', () => {
  it('prices a raw type via its Compressed counterpart, keyed back to the raw typeId', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[COMPRESSED_ZEOLITES, { sellMin: 1444, buyMax: 1343, sellVolume: 0, buyVolume: 0 }]])
    );

    const prices = await loadJitaUnitPrices([ZEOLITES]);

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.anything(), [COMPRESSED_ZEOLITES]);
    expect(prices.get(ZEOLITES)).toBe(1343);
  });

  it('prices at the buy side, not the sell side', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[COMPRESSED_ZEOLITES, { sellMin: 1444, buyMax: 1343, sellVolume: 0, buyVolume: 0 }]])
    );

    const prices = await loadJitaUnitPrices([ZEOLITES]);

    expect(prices.get(ZEOLITES)).not.toBe(1444);
  });

  it('falls back to pricing the raw type itself when there is no Compressed counterpart', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[VELDSPAR, { sellMin: 10, buyMax: 6, sellVolume: 0, buyVolume: 0 }]])
    );

    const prices = await loadJitaUnitPrices([VELDSPAR]);

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.anything(), [VELDSPAR]);
    expect(prices.get(VELDSPAR)).toBe(6);
  });

  it('is 0 for a type with no buy orders, not undefined', async () => {
    pricesMock.getHubPrices.mockResolvedValue(new Map());

    const prices = await loadJitaUnitPrices([VELDSPAR]);

    expect(prices.get(VELDSPAR)).toBe(0);
  });

  it('is empty for an empty input, without calling the hub or the SDE', async () => {
    const prices = await loadJitaUnitPrices([]);

    expect(prices.size).toBe(0);
    expect(pricesMock.getHubPrices).not.toHaveBeenCalled();
    expect(sdeMock.loadCompressedOreTypeIds).not.toHaveBeenCalled();
  });

  it('dedupes two raw types that share one Compressed counterpart into one hub lookup', async () => {
    const SYLVITE = 45491;
    sdeMock.loadCompressedOreTypeIds.mockResolvedValue({
      [ZEOLITES]: COMPRESSED_ZEOLITES,
      [SYLVITE]: COMPRESSED_ZEOLITES, // contrived, but exercises the dedupe path
    });
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[COMPRESSED_ZEOLITES, { sellMin: 1444, buyMax: 1343, sellVolume: 0, buyVolume: 0 }]])
    );

    const prices = await loadJitaUnitPrices([ZEOLITES, SYLVITE]);

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.anything(), [COMPRESSED_ZEOLITES]);
    expect(prices.get(ZEOLITES)).toBe(1343);
    expect(prices.get(SYLVITE)).toBe(1343);
  });
});
