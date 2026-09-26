import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTradeHub, type TradeHub } from '@/market/hubs';
import {
  hubForPayee,
  loadDatedUnitPricesByHub,
  loadUnitPricesOnDate,
  pricesAtHubOnDate,
  type DatedUnitPrices,
} from './pricing';

const ZEOLITES = 45490;
const COMPRESSED_ZEOLITES = 62463;
const VELDSPAR = 1230; // no compressed pairing seeded — prices as itself
const CHARACTER_ID = 91;
const DATE = '2026-09-04';

const pricesMock = vi.hoisted(() => ({ getHubPrices: vi.fn() }));
vi.mock('@/market/prices', () => pricesMock);

const sdeMock = vi.hoisted(() => ({ loadCompressedOreTypeIds: vi.fn() }));
vi.mock('@/sde/loadSde', () => sdeMock);

const hubSnapshotMock = vi.hoisted(() => ({ loadHubSnapshotRange: vi.fn() }));
vi.mock('@/features/market/hubSnapshot', () => hubSnapshotMock);

const priceSnapshotsMock = vi.hoisted(() => ({ loadPriceSnapshots: vi.fn() }));
vi.mock('./priceSnapshots', () => priceSnapshotsMock);

const EMPTY_HUB_SNAPSHOT = { saved: new Map(), historical: new Map() };

beforeEach(() => {
  vi.clearAllMocks();
  sdeMock.loadCompressedOreTypeIds.mockResolvedValue({ [ZEOLITES]: COMPRESSED_ZEOLITES });
  hubSnapshotMock.loadHubSnapshotRange.mockResolvedValue(EMPTY_HUB_SNAPSHOT);
  priceSnapshotsMock.loadPriceSnapshots.mockResolvedValue(new Map());
});

describe('loadUnitPricesOnDate', () => {
  it("falls through to today's live price when nothing was saved or backfilled for the date", async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[COMPRESSED_ZEOLITES, { sellMin: 1444, buyMax: 1343, sellVolume: 0, buyVolume: 0 }]])
    );

    const { prices } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [ZEOLITES],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.anything(), [COMPRESSED_ZEOLITES]);
    expect(prices.get(ZEOLITES)).toBe(1343);
  });

  it('prices at the buy side, not the sell side', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[COMPRESSED_ZEOLITES, { sellMin: 1444, buyMax: 1343, sellVolume: 0, buyVolume: 0 }]])
    );

    const { prices } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [ZEOLITES],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect(prices.get(ZEOLITES)).not.toBe(1444);
  });

  it('falls back to pricing the raw type itself when there is no Compressed counterpart', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[VELDSPAR, { sellMin: 10, buyMax: 6, sellVolume: 0, buyVolume: 0 }]])
    );

    const { prices } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [VELDSPAR],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.anything(), [VELDSPAR]);
    expect(prices.get(VELDSPAR)).toBe(6);
  });

  it('is 0 for a type with no price at all, not undefined', async () => {
    pricesMock.getHubPrices.mockResolvedValue(new Map());

    const { prices } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [VELDSPAR],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect(prices.get(VELDSPAR)).toBe(0);
  });

  it('reports a type with no price as unpriced, keyed by the raw typeId', async () => {
    pricesMock.getHubPrices.mockResolvedValue(new Map());

    const { unpriced } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [VELDSPAR],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect([...unpriced]).toEqual([VELDSPAR]);
  });

  it('leaves a priced type out of the unpriced set', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[COMPRESSED_ZEOLITES, { sellMin: 1444, buyMax: 1343, sellVolume: 0, buyVolume: 0 }]])
    );

    const { unpriced } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [ZEOLITES],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect(unpriced.size).toBe(0);
  });

  it('treats a zero buyMax as unpriced too — an order book that quotes 0 prices nothing', async () => {
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[VELDSPAR, { sellMin: 10, buyMax: 0, sellVolume: 0, buyVolume: 0 }]])
    );

    const { unpriced } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [VELDSPAR],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect([...unpriced]).toEqual([VELDSPAR]);
  });

  it('is empty for an empty input, without calling the hub, the SDE, or the snapshot sources', async () => {
    const { prices, unpriced } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect(prices.size).toBe(0);
    expect(unpriced.size).toBe(0);
    expect(pricesMock.getHubPrices).not.toHaveBeenCalled();
    expect(sdeMock.loadCompressedOreTypeIds).not.toHaveBeenCalled();
    expect(hubSnapshotMock.loadHubSnapshotRange).not.toHaveBeenCalled();
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

    const { prices } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [ZEOLITES, SYLVITE],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.anything(), [COMPRESSED_ZEOLITES]);
    expect(prices.get(ZEOLITES)).toBe(1343);
    expect(prices.get(SYLVITE)).toBe(1343);
  });

  it('prices at the hub it is given, not always at Jita, including the server snapshot lookup', async () => {
    pricesMock.getHubPrices.mockResolvedValue(new Map());
    const hek = getTradeHub('hek') as TradeHub;

    await loadUnitPricesOnDate(CHARACTER_ID, [VELDSPAR], hek, DATE);

    expect(pricesMock.getHubPrices).toHaveBeenCalledWith(expect.objectContaining({ id: 'hek' }), [
      VELDSPAR,
    ]);
    expect(hubSnapshotMock.loadHubSnapshotRange).toHaveBeenCalledWith(
      CHARACTER_ID,
      DATE,
      DATE,
      hek
    );
    // Dexie only ever holds Jita — no equivalent for a non-default hub.
    expect(priceSnapshotsMock.loadPriceSnapshots).not.toHaveBeenCalled();
  });

  it("prefers the server's saved snapshot for the date over today's live price", async () => {
    hubSnapshotMock.loadHubSnapshotRange.mockResolvedValue({
      saved: new Map([[DATE, new Map([[VELDSPAR, { buy: 50, sell: 60 }]])]]),
      historical: new Map(),
    });
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[VELDSPAR, { sellMin: 10, buyMax: 999, sellVolume: 0, buyVolume: 0 }]])
    );

    const { prices } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [VELDSPAR],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect(prices.get(VELDSPAR)).toBe(50);
  });

  it("falls back to Adam4EVE's historical split when nothing was saved for the date", async () => {
    hubSnapshotMock.loadHubSnapshotRange.mockResolvedValue({
      saved: new Map(),
      historical: new Map([[DATE, new Map([[VELDSPAR, { buy: 40, sell: 45 }]])]]),
    });
    pricesMock.getHubPrices.mockResolvedValue(
      new Map([[VELDSPAR, { sellMin: 10, buyMax: 999, sellVolume: 0, buyVolume: 0 }]])
    );

    const { prices } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [VELDSPAR],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    expect(prices.get(VELDSPAR)).toBe(40);
  });

  it('merges in the per-browser Dexie snapshot for Jita, server winning over it', async () => {
    priceSnapshotsMock.loadPriceSnapshots.mockResolvedValue(
      new Map([[DATE, { [VELDSPAR]: { buy: 20, sell: 25 }, [ZEOLITES]: { buy: 5, sell: 6 } }]])
    );
    hubSnapshotMock.loadHubSnapshotRange.mockResolvedValue({
      saved: new Map([[DATE, new Map([[VELDSPAR, { buy: 50, sell: 60 }]])]]),
      historical: new Map(),
    });
    pricesMock.getHubPrices.mockResolvedValue(new Map());
    sdeMock.loadCompressedOreTypeIds.mockResolvedValue({});

    const { prices } = await loadUnitPricesOnDate(
      CHARACTER_ID,
      [VELDSPAR, ZEOLITES],
      getTradeHub('jita') as TradeHub,
      DATE
    );

    // Server (50) wins over Dexie (20) for VELDSPAR; Dexie alone fills ZEOLITES.
    expect(prices.get(VELDSPAR)).toBe(50);
    expect(prices.get(ZEOLITES)).toBe(5);
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

describe('loadDatedUnitPricesByHub', () => {
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

    const { byHubAndDate } = await loadDatedUnitPricesByHub(
      CHARACTER_ID,
      [ZEOLITES],
      [undefined, undefined],
      [DATE]
    );

    expect(pricesMock.getHubPrices).toHaveBeenCalledTimes(1);
    expect(byHubAndDate.get('jita')?.get(DATE)?.get(ZEOLITES)).toBe(1343);
  });

  it('prices every named hub, keyed by hub id then date, and always loads the default too', async () => {
    pricesMock.getHubPrices.mockImplementation(
      buyMaxByStation({ [JITA.stationId]: 1343, [HEK.stationId]: 900 })
    );

    const { byHubAndDate } = await loadDatedUnitPricesByHub(
      CHARACTER_ID,
      [ZEOLITES],
      ['hek'],
      [DATE]
    );

    // Two hubs, one lookup each — the default is loaded even though no Payee
    // named it, since unassigned ore is still valued at Jita.
    expect(pricesMock.getHubPrices).toHaveBeenCalledTimes(2);
    expect(byHubAndDate.get('hek')?.get(DATE)?.get(ZEOLITES)).toBe(900);
    expect(byHubAndDate.get('jita')?.get(DATE)?.get(ZEOLITES)).toBe(1343);
  });

  it('collapses several Payees at one hub into a single lookup', async () => {
    pricesMock.getHubPrices.mockImplementation(
      buyMaxByStation({ [JITA.stationId]: 1343, [HEK.stationId]: 900 })
    );

    await loadDatedUnitPricesByHub(
      CHARACTER_ID,
      [ZEOLITES],
      ['hek', 'hek', undefined, 'jita'],
      [DATE]
    );

    expect(pricesMock.getHubPrices).toHaveBeenCalledTimes(2);
  });

  it('reports what could not be priced per hub (union across dates), and as a union overall', async () => {
    // Hek quotes nothing for this ore; Jita does.
    pricesMock.getHubPrices.mockImplementation(buyMaxByStation({ [JITA.stationId]: 1343 }));

    const { unpricedByHub, unpriced } = await loadDatedUnitPricesByHub(
      CHARACTER_ID,
      [ZEOLITES],
      ['hek'],
      [DATE]
    );

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

    const { byHubAndDate } = await loadDatedUnitPricesByHub(
      CHARACTER_ID,
      [ZEOLITES, VELDSPAR],
      ['hek'],
      [DATE]
    );

    expect(byHubAndDate.get('hek')?.get(DATE)?.get(VELDSPAR)).toBe(900);
    expect(byHubAndDate.get('hek')?.get(DATE)?.get(ZEOLITES)).toBe(900);
  });

  it('prices every date the ledger needs, independently', async () => {
    const OTHER_DATE = '2026-09-05';
    hubSnapshotMock.loadHubSnapshotRange.mockResolvedValue({
      // Keyed by the Compressed type_id — the server snapshot prices the
      // tradeable compressed item, same as `resolvePricesForHubAcrossDates`
      // looks it up.
      saved: new Map([
        [DATE, new Map([[COMPRESSED_ZEOLITES, { buy: 100, sell: 110 }]])],
        [OTHER_DATE, new Map([[COMPRESSED_ZEOLITES, { buy: 200, sell: 210 }]])],
      ]),
      historical: new Map(),
    });
    pricesMock.getHubPrices.mockResolvedValue(new Map());

    const { byHubAndDate } = await loadDatedUnitPricesByHub(
      CHARACTER_ID,
      [ZEOLITES],
      [undefined],
      [DATE, OTHER_DATE]
    );

    expect(byHubAndDate.get('jita')?.get(DATE)?.get(ZEOLITES)).toBe(100);
    expect(byHubAndDate.get('jita')?.get(OTHER_DATE)?.get(ZEOLITES)).toBe(200);
  });
});

describe('pricesAtHubOnDate', () => {
  const data: DatedUnitPrices = {
    byHubAndDate: new Map([
      ['jita', new Map([[DATE, new Map([[ZEOLITES, 1343]])]])],
      ['hek', new Map([[DATE, new Map([[ZEOLITES, 900]])]])],
    ]),
    unpricedByHub: new Map(),
    unpriced: new Set(),
  };

  it('reads the map belonging to the Payee’s hub and date', () => {
    expect(pricesAtHubOnDate(data, 'hek', DATE).get(ZEOLITES)).toBe(900);
  });

  it('reads the default hub’s map for a Payee that names none', () => {
    expect(pricesAtHubOnDate(data, undefined, DATE).get(ZEOLITES)).toBe(1343);
  });

  it('falls back to the default hub rather than to nothing when a hub was never loaded', () => {
    const jitaOnly: DatedUnitPrices = {
      byHubAndDate: new Map([['jita', new Map([[DATE, new Map([[ZEOLITES, 1343]])]])]]),
      unpricedByHub: new Map(),
      unpriced: new Set(),
    };
    expect(pricesAtHubOnDate(jitaOnly, 'hek', DATE).get(ZEOLITES)).toBe(1343);
  });

  it('is empty, never undefined, when nothing at all was loaded', () => {
    const empty: DatedUnitPrices = {
      byHubAndDate: new Map(),
      unpricedByHub: new Map(),
      unpriced: new Set(),
    };
    expect(pricesAtHubOnDate(empty, 'hek', DATE).size).toBe(0);
  });

  it('is empty for a date that was never loaded at a hub that was', () => {
    expect(pricesAtHubOnDate(data, 'hek', '2099-01-01').size).toBe(0);
  });
});
