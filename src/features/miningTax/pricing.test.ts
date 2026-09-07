import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import { hubForPayee, loadUnitPrices, loadUnitPricesByHub, pricesAtHub } from './pricing';

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

describe('loadUnitPrices', () => {
  it('prices a raw type via its Compressed counterpart, keyed back to the raw typeId', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[COMPRESSED_ZEOLITES, { sellMin: 1444, buyMax: 1343, sellVolume: 0, buyVolume: 0 }]])
    );

    const { prices } = await loadUnitPrices([ZEOLITES]);

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.anything(), [COMPRESSED_ZEOLITES]);
    expect(prices.get(ZEOLITES)).toBe(1343);
  });

  it('prices at the buy side, not the sell side', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[COMPRESSED_ZEOLITES, { sellMin: 1444, buyMax: 1343, sellVolume: 0, buyVolume: 0 }]])
    );

    const { prices } = await loadUnitPrices([ZEOLITES]);

    expect(prices.get(ZEOLITES)).not.toBe(1444);
  });

  it('falls back to pricing the raw type itself when there is no Compressed counterpart', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[VELDSPAR, { sellMin: 10, buyMax: 6, sellVolume: 0, buyVolume: 0 }]])
    );

    const { prices } = await loadUnitPrices([VELDSPAR]);

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.anything(), [VELDSPAR]);
    expect(prices.get(VELDSPAR)).toBe(6);
  });

  it('is 0 for a type with no buy orders, not undefined', async () => {
    pricesMock.getHubPrices.mockResolvedValue(new Map());

    const { prices } = await loadUnitPrices([VELDSPAR]);

    expect(prices.get(VELDSPAR)).toBe(0);
  });

  it('reports a type with no buy orders as unpriced, keyed by the raw typeId', async () => {
    pricesMock.getHubPrices.mockResolvedValue(new Map());

    const { unpriced } = await loadUnitPrices([VELDSPAR]);

    // The 0 above is what keeps the totals arithmetic working; this set is
    // what stops it being read as "this ore is worth nothing".
    expect([...unpriced]).toEqual([VELDSPAR]);
  });

  it('leaves a priced type out of the unpriced set', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[COMPRESSED_ZEOLITES, { sellMin: 1444, buyMax: 1343, sellVolume: 0, buyVolume: 0 }]])
    );

    const { unpriced } = await loadUnitPrices([ZEOLITES]);

    expect(unpriced.size).toBe(0);
  });

  it('treats a zero buyMax as unpriced too — an order book that quotes 0 prices nothing', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[VELDSPAR, { sellMin: 10, buyMax: 0, sellVolume: 0, buyVolume: 0 }]])
    );

    const { unpriced } = await loadUnitPrices([VELDSPAR]);

    expect([...unpriced]).toEqual([VELDSPAR]);
  });

  it('is empty for an empty input, without calling the hub or the SDE', async () => {
    const { prices, unpriced } = await loadUnitPrices([]);

    expect(prices.size).toBe(0);
    expect(unpriced.size).toBe(0);
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

    const { prices } = await loadUnitPrices([ZEOLITES, SYLVITE]);

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.anything(), [COMPRESSED_ZEOLITES]);
    expect(prices.get(ZEOLITES)).toBe(1343);
    expect(prices.get(SYLVITE)).toBe(1343);
  });

  it('prices at the hub it is given, not always at Jita', async () => {
    pricesMock.getHubPrices.mockResolvedValue(new Map());

    await loadUnitPrices([VELDSPAR], getTradeHub('hek') as TradeHub);

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.objectContaining({ id: 'hek' }), [
      VELDSPAR,
    ]);
  });
});

describe('hubForPayee', () => {
  it('resolves a Payee’s own hub id', () => {
    expect(hubForPayee('hek').id).toBe('hek');
  });

  it('falls back to Jita for a Payee that names none', () => {
    expect(hubForPayee(undefined).id).toBe('jita');
  });

  it('falls back to Jita for a hub id this build does not know', () => {
    expect(hubForPayee('perimeter').id).toBe('jita');
  });
});

describe('loadUnitPricesByHub', () => {
  /** Distinct buy prices per station, so a test can tell the two order books apart. */
  function buyMaxByStation(priceByStationId: Record<number, number>) {
    return (hub: TradeHub, typeIds: number[]) =>
      Promise.resolve(
        new Map(
          typeIds.map((typeId) => [
            typeId,
            {
              sellMin: null,
              buyMax: priceByStationId[hub.stationId] ?? null,
              sellVolume: 0,
              buyVolume: 0,
            },
          ])
        )
      );
  }

  const JITA = getTradeHub('jita') as TradeHub;
  const HEK = getTradeHub('hek') as TradeHub;

  it('makes exactly one hub lookup for an all-Jita ledger', async () => {
    pricesMock.getHubPrices.mockImplementation(buyMaxByStation({ [JITA.stationId]: 1343 }));

    const { byHub } = await loadUnitPricesByHub([ZEOLITES], [undefined, undefined]);

    expect(pricesMock.getHubPrices).toHaveBeenCalledTimes(1);
    expect(byHub.get('jita')?.get(ZEOLITES)).toBe(1343);
  });

  it('prices every named hub, keyed by hub id, and always loads the default too', async () => {
    pricesMock.getHubPrices.mockImplementation(
      buyMaxByStation({ [JITA.stationId]: 1343, [HEK.stationId]: 900 })
    );

    const { byHub } = await loadUnitPricesByHub([ZEOLITES], ['hek']);

    // Two hubs, one lookup each — the default is loaded even though no Payee
    // named it, since unassigned ore is still valued at Jita.
    expect(pricesMock.getHubPrices).toHaveBeenCalledTimes(2);
    expect(byHub.get('hek')?.get(ZEOLITES)).toBe(900);
    expect(byHub.get('jita')?.get(ZEOLITES)).toBe(1343);
  });

  it('collapses several Payees at one hub into a single lookup', async () => {
    pricesMock.getHubPrices.mockImplementation(
      buyMaxByStation({ [JITA.stationId]: 1343, [HEK.stationId]: 900 })
    );

    await loadUnitPricesByHub([ZEOLITES], ['hek', 'hek', undefined, 'jita']);

    expect(pricesMock.getHubPrices).toHaveBeenCalledTimes(2);
  });

  it('reports what could not be priced per hub, and as a union', async () => {
    // Hek quotes nothing for this ore; Jita does.
    pricesMock.getHubPrices.mockImplementation(buyMaxByStation({ [JITA.stationId]: 1343 }));

    const { unpricedByHub, unpriced } = await loadUnitPricesByHub([ZEOLITES], ['hek']);

    expect([...(unpricedByHub.get('hek') ?? [])]).toEqual([ZEOLITES]);
    expect(unpricedByHub.get('jita')?.size).toBe(0);
    // The union is only the "is there anything to say" gate — the banner
    // names the hub, so Jita is never blamed for Hek's empty order book.
    expect([...unpriced]).toEqual([ZEOLITES]);
  });

  it('prices every hub for the whole type list, so a live re-price has something to read', async () => {
    pricesMock.getHubPrices.mockImplementation(
      buyMaxByStation({ [JITA.stationId]: 1343, [HEK.stationId]: 900 })
    );

    const { byHub } = await loadUnitPricesByHub([ZEOLITES, VELDSPAR], ['hek']);

    expect(byHub.get('hek')?.get(VELDSPAR)).toBe(900);
    expect(byHub.get('hek')?.get(ZEOLITES)).toBe(900);
  });
});

describe('pricesAtHub', () => {
  const byHub = new Map<TradeHub['id'], ReadonlyMap<number, number>>([
    ['jita', new Map([[ZEOLITES, 1343]])],
    ['hek', new Map([[ZEOLITES, 900]])],
  ]);

  it('reads the map belonging to the Payee’s hub', () => {
    expect(pricesAtHub(byHub, 'hek').get(ZEOLITES)).toBe(900);
  });

  it('reads the default hub’s map for a Payee that names none', () => {
    expect(pricesAtHub(byHub, undefined).get(ZEOLITES)).toBe(1343);
  });

  it('falls back to the default hub rather than to nothing when a hub was never loaded', () => {
    expect(pricesAtHub(new Map([['jita', new Map([[ZEOLITES, 1343]])]]), 'hek').get(ZEOLITES)).toBe(
      1343
    );
  });

  it('is empty, never undefined, when nothing at all was loaded', () => {
    expect(pricesAtHub(new Map(), 'hek').size).toBe(0);
  });
});
