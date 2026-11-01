import { describe, expect, it } from 'vitest';
import {
  MARKET_OPEN_PRICES_MAX_DAYS,
  MARKET_OPEN_PRICES_REGION_IDS,
  OpenPriceFold,
  SNAPSHOT_HUBS,
  StationPriceFold,
  addDays,
  dateRange,
  dayIndexUrl,
  groupByDocument,
  implausibleReason,
  EXORDIUM_REGION_ID,
  MIN_PAIRS_EXORDIUM,
  MIN_PAIRS_PER_REGION,
  isIsoDate,
  mergeDays,
  openPriceDocId,
  pairKey,
  findFinalSnapshot,
  isFinalSlot,
  pickLastSnapshot,
  regionCounts,
  shrunkRegion,
  previousUtcDate,
} from './marketOpenPrices.js';

const FORGE = 10000002;
const DOMAIN = 10000043;
const JITA = 60003760;
const AMARR = 60008494;

describe('dates', () => {
  it('previousUtcDate is the UTC day before, whatever the time', () => {
    expect(previousUtcDate(new Date('2026-10-18T00:35:00Z'))).toBe('2026-10-17');
    expect(previousUtcDate(new Date('2026-03-01T23:59:59Z'))).toBe('2026-02-28');
  });
  it('addDays and dateRange cross month ends', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(dateRange('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(dateRange('2026-01-02', '2026-01-01')).toEqual([]);
  });
  it('isIsoDate rejects impossible dates', () => {
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
    expect(isIsoDate('2026-10-18')).toBe(true);
  });
  it('dayIndexUrl points at the day directory', () => {
    expect(dayIndexUrl('2026-10-17')).toBe(
      'https://data.everef.net/market-orders/history/2026/2026-10-17/index.json'
    );
  });
});

describe('pickLastSnapshot', () => {
  const file = (time: string, name = `market-orders-${time}.v3.csv.bz2`) => ({
    file_time: time,
    name,
    url: `https://x/${name}`,
  });

  it('picks the file with the latest file_time on that day, with its time', () => {
    const listing = {
      files: [
        file('2026-10-17T23:45:06Z'),
        file('2026-10-17T00:15:05Z'),
        file('2026-10-17T12:15:05Z'),
      ],
    };
    expect(pickLastSnapshot(listing, '2026-10-17')).toEqual({
      url: 'https://x/market-orders-2026-10-17T23:45:06Z.v3.csv.bz2',
      fileTime: '2026-10-17T23:45:06Z',
    });
  });
  it('ignores other days and non-bz2 files', () => {
    const listing = {
      files: [file('2026-10-18T00:15:05Z'), file('2026-10-17T23:45:06Z', 'readme.txt')],
    };
    expect(pickLastSnapshot(listing, '2026-10-17')).toBeNull();
  });
  it('is null for a malformed or empty listing', () => {
    expect(pickLastSnapshot(null, '2026-10-17')).toBeNull();
    expect(pickLastSnapshot({}, '2026-10-17')).toBeNull();
    expect(pickLastSnapshot({ files: [{ file_time: 1 }, 'x'] }, '2026-10-17')).toBeNull();
  });
});

describe('isFinalSlot', () => {
  it("is true only for a snapshot taken in the day's last half hour", () => {
    expect(isFinalSlot('2026-10-17T23:45:06Z', '2026-10-17')).toBe(true);
    expect(isFinalSlot('2026-10-17T23:30:00Z', '2026-10-17')).toBe(true);
    expect(isFinalSlot('2026-10-17T23:15:06Z', '2026-10-17')).toBe(false);
    expect(isFinalSlot('2026-10-16T23:45:06Z', '2026-10-17')).toBe(false);
  });
});

describe('findFinalSnapshot', () => {
  const listingOf = (...times: string[]) => ({
    files: times.map((t) => ({ file_time: t, name: `m-${t}.csv.bz2`, url: `https://x/${t}` })),
  });
  const fetcher = (byUrl: Record<string, unknown>) => {
    const asked: string[] = [];
    const fetchListing = async (url: string) => {
      asked.push(url);
      return byUrl[url] ?? null;
    };
    return { fetchListing, asked };
  };
  const day = '2026-10-17';

  it('takes the 23:45 snapshot without reading the next day', async () => {
    const { fetchListing, asked } = fetcher({
      [dayIndexUrl(day)]: listingOf('2026-10-17T23:15:06Z', '2026-10-17T23:45:06Z'),
    });
    expect(await findFinalSnapshot(day, fetchListing)).toEqual({
      final: true,
      snapshot: { url: 'https://x/2026-10-17T23:45:06Z', fileTime: '2026-10-17T23:45:06Z' },
    });
    expect(asked).toEqual([dayIndexUrl(day)]);
  });
  it('is not final when the last listed snapshot is earlier and the next day has none yet', async () => {
    const { fetchListing } = fetcher({
      [dayIndexUrl(day)]: listingOf('2026-10-17T22:45:06Z', '2026-10-17T23:15:06Z'),
    });
    expect(await findFinalSnapshot(day, fetchListing)).toEqual({
      final: false,
      snapshot: { url: 'https://x/2026-10-17T23:15:06Z', fileTime: '2026-10-17T23:15:06Z' },
    });
  });
  it('accepts an earlier snapshot once the next day is listed: the final slot was skipped', async () => {
    const { fetchListing } = fetcher({
      [dayIndexUrl(day)]: listingOf('2026-10-17T23:15:06Z'),
      [dayIndexUrl('2026-10-18')]: listingOf('2026-10-18T00:15:05Z'),
    });
    expect(await findFinalSnapshot(day, fetchListing)).toEqual({
      final: true,
      snapshot: { url: 'https://x/2026-10-17T23:15:06Z', fileTime: '2026-10-17T23:15:06Z' },
    });
  });
  it('is not final with no snapshot listed at all, even once the next day is', async () => {
    const { fetchListing } = fetcher({
      [dayIndexUrl('2026-10-18')]: listingOf('2026-10-18T00:15:05Z'),
    });
    expect(await findFinalSnapshot(day, fetchListing)).toEqual({ final: false, snapshot: null });
  });
});

describe('OpenPriceFold', () => {
  it('keeps the highest buy and lowest sell per region and type', () => {
    const fold = new OpenPriceFold();
    fold.add(FORGE, 34, true, 5);
    fold.add(FORGE, 34, true, 6);
    fold.add(FORGE, 34, true, 4);
    fold.add(FORGE, 34, false, 8);
    fold.add(FORGE, 34, false, 7);
    fold.add(FORGE, 34, false, 9);
    expect([...fold.entries()]).toEqual([{ regionId: FORGE, typeId: 34, buy: 6, sell: 7 }]);
  });
  it('leaves the side with no orders null and keeps regions apart', () => {
    const fold = new OpenPriceFold();
    fold.add(FORGE, 35, true, 2);
    fold.add(DOMAIN, 35, false, 3);
    const byKey = new Map([...fold.entries()].map((e) => [pairKey(e.regionId, e.typeId), e]));
    expect(byKey.get(`${FORGE}_35`)).toMatchObject({ buy: 2, sell: null });
    expect(byKey.get(`${DOMAIN}_35`)).toMatchObject({ buy: null, sell: 3 });
  });
  it('ignores untracked regions and bad rows', () => {
    const fold = new OpenPriceFold();
    fold.add(10000001, 34, true, 5);
    fold.add(FORGE, 34, true, Number.NaN);
    fold.add(FORGE, 34, true, 0);
    fold.add(FORGE, Number.NaN, true, 5);
    expect(fold.size).toBe(0);
  });
  it('the guard names the first starved region', () => {
    const fold = new OpenPriceFold([FORGE, DOMAIN]);
    for (let t = 0; t < 3; t++) fold.add(FORGE, t, true, 1);
    fold.add(DOMAIN, 1, true, 1);
    expect(implausibleReason(fold, 3)).toContain(String(DOMAIN));
    fold.add(DOMAIN, 2, true, 1);
    fold.add(DOMAIN, 3, true, 1);
    expect(implausibleReason(fold, 3)).toBeNull();
    expect(implausibleReason(new OpenPriceFold([FORGE]), 1)).toContain(String(FORGE));
  });
});

describe('the guard for Exordium', () => {
  const FORGE_ONLY_DAY = (fold: OpenPriceFold, regionId: number, count: number) => {
    for (let t = 1; t <= count; t++) fold.add(regionId, t, true, 1);
  };

  it('tracks Exordium alongside the five Trade Hub regions', () => {
    expect(MARKET_OPEN_PRICES_REGION_IDS).toContain(EXORDIUM_REGION_ID);
    expect(SNAPSHOT_HUBS.map((hub) => hub.id)).toContain('manifest');
  });

  it('holds the starter region to its own, lower minimum', () => {
    expect(MIN_PAIRS_EXORDIUM).toBeLessThan(MIN_PAIRS_PER_REGION);
    const fold = new OpenPriceFold([FORGE, EXORDIUM_REGION_ID]);
    FORGE_ONLY_DAY(fold, FORGE, MIN_PAIRS_PER_REGION);
    FORGE_ONLY_DAY(fold, EXORDIUM_REGION_ID, MIN_PAIRS_EXORDIUM);
    expect(implausibleReason(fold)).toBeNull();
  });

  it('still rejects a near-empty Exordium day, and a thin Forge day is still too thin', () => {
    const empty = new OpenPriceFold([FORGE, EXORDIUM_REGION_ID]);
    FORGE_ONLY_DAY(empty, FORGE, MIN_PAIRS_PER_REGION);
    FORGE_ONLY_DAY(empty, EXORDIUM_REGION_ID, MIN_PAIRS_EXORDIUM - 1);
    expect(implausibleReason(empty)).toContain(String(EXORDIUM_REGION_ID));
    const thinForge = new OpenPriceFold([FORGE]);
    FORGE_ONLY_DAY(thinForge, FORGE, MIN_PAIRS_EXORDIUM);
    expect(implausibleReason(thinForge)).toContain(String(FORGE));
  });
});

describe('openPriceDocId', () => {
  it('is one object per type', () => {
    expect(openPriceDocId(34)).toBe('34');
  });
});

describe('StationPriceFold for every type', () => {
  it('keeps the best buy and sell per hub station for any type when no type list is given', () => {
    const f = new StationPriceFold(SNAPSHOT_HUBS);
    f.add(JITA, 587, true, 10);
    f.add(JITA, 587, true, 12);
    f.add(JITA, 587, false, 15);
    f.add(AMARR, 44992, false, 3);
    expect(f.prices(JITA)).toEqual({ 587: [12, 15] });
    expect([...f.entries()]).toEqual([
      { stationId: JITA, typeId: 587, buy: 12, sell: 15 },
      { stationId: AMARR, typeId: 44992, buy: null, sell: 3 },
    ]);
    expect(f.size).toBe(2);
  });
  it('ignores non-hub stations, a non-integer type and unusable prices', () => {
    const f = new StationPriceFold(SNAPSHOT_HUBS);
    f.add(60003761, 587, true, 10);
    f.add(JITA, 1.5, true, 10);
    f.add(JITA, 587, true, 0);
    f.add(JITA, 587, false, Number.POSITIVE_INFINITY);
    expect(f.size).toBe(0);
  });
  it('narrows to the given types and reads a subset back', () => {
    const f = new StationPriceFold(SNAPSHOT_HUBS, [34]);
    f.add(JITA, 35, true, 1);
    f.add(JITA, 34, true, 2);
    expect(f.prices(JITA)).toEqual({ 34: [2, null] });
    const all = new StationPriceFold(SNAPSHOT_HUBS);
    all.add(JITA, 35, true, 1);
    all.add(JITA, 34, true, 2);
    expect(all.prices(JITA, new Set([34]))).toEqual({ 34: [2, null] });
  });
});

describe('mergeDays', () => {
  const base = { typeId: 34 };
  const day = (
    date: string,
    stations: Record<string, { buy: number | null; sell: number | null }>
  ) => ({
    date,
    stations,
  });

  it('starts an object from nothing: shared dates, per-station parallel arrays', () => {
    expect(
      mergeDays(base, null, [
        day('2026-10-17', { [JITA]: { buy: 5, sell: 6 }, [AMARR]: { buy: null, sell: 9 } }),
      ])
    ).toEqual({
      typeId: 34,
      dates: ['2026-10-17'],
      stations: { [JITA]: { buy: [5], sell: [6] }, [AMARR]: { buy: [null], sell: [9] } },
    });
  });
  it('a station with no orders on a day reads null there, and no day is invented for a gap', () => {
    const first = mergeDays(base, null, [day('2026-10-10', { [JITA]: { buy: 1, sell: 2 } })]);
    const next = mergeDays(base, first, [day('2026-10-17', { [AMARR]: { buy: 3, sell: 4 } })]);
    expect(next.dates).toEqual(['2026-10-10', '2026-10-17']);
    expect(next.stations).toEqual({
      [JITA]: { buy: [1, null], sell: [2, null] },
      [AMARR]: { buy: [null, 3], sell: [null, 4] },
    });
  });
  it('is idempotent: re-running a day replaces that whole day', () => {
    const once = mergeDays(base, null, [
      day('2026-10-17', { [JITA]: { buy: 5, sell: 6 }, [AMARR]: { buy: 1, sell: 1 } }),
    ]);
    const again = mergeDays(base, once, [day('2026-10-17', { [JITA]: { buy: 7, sell: 8 } })]);
    expect(again).toEqual({
      typeId: 34,
      dates: ['2026-10-17'],
      stations: { [JITA]: { buy: [7], sell: [8] } },
    });
    expect(mergeDays(base, again, [day('2026-10-17', { [JITA]: { buy: 7, sell: 8 } })])).toEqual(
      again
    );
  });
  it('slots older days in order (backfill after the daily job), keeping the stored ones', () => {
    const live = mergeDays(base, null, [day('2026-10-17', { [JITA]: { buy: 5, sell: 6 } })]);
    const back = mergeDays(base, live, [
      day('2026-10-15', { [JITA]: { buy: 1, sell: 2 } }),
      day('2026-10-16', { [JITA]: { buy: 3, sell: 4 } }),
    ]);
    expect(back.dates).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(back.stations[JITA].buy).toEqual([1, 3, 5]);
  });
  it('caps at the newest 400 days and drops a station left with no price', () => {
    const days = dateRange('2025-01-01', '2026-12-31').map((date, i) =>
      day(date, i === 0 ? { [AMARR]: { buy: 1, sell: 1 } } : { [JITA]: { buy: i, sell: i } })
    );
    const merged = mergeDays(base, null, days);
    expect(merged.dates).toHaveLength(MARKET_OPEN_PRICES_MAX_DAYS);
    expect(merged.dates.at(-1)).toBe('2026-12-31');
    expect(merged.stations[JITA].buy.at(-1)).toBe(days.length - 1);
    expect(merged.stations[JITA].buy).toHaveLength(MARKET_OPEN_PRICES_MAX_DAYS);
    expect(Object.keys(merged.stations)).toEqual([String(JITA)]);
  });
  it('reads a ragged or malformed stored station as null where it falls short', () => {
    const merged = mergeDays(
      base,
      {
        dates: ['2026-10-01', '2026-10-02'],
        stations: { [JITA]: { buy: [1], sell: [2, 3] }, junk: 'x' } as never,
      },
      [day('2026-10-03', { [JITA]: { buy: 9, sell: 9 } })]
    );
    expect(merged.dates).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(merged.stations).toEqual({
      [JITA]: { buy: [1, null, 9], sell: [2, 3, 9] },
    });
  });
  it('drops a stored date where no station has a price', () => {
    const merged = mergeDays(
      base,
      {
        dates: ['2026-10-01', '2026-10-02'],
        stations: { [JITA]: { buy: [null, 1], sell: [null, 2] } },
      },
      []
    );
    expect(merged).toEqual({
      typeId: 34,
      dates: ['2026-10-02'],
      stations: { [JITA]: { buy: [1], sell: [2] } },
    });
  });

  it('keeps an object of 400 days x 5 stations well under 1 MB', () => {
    const stations = SNAPSHOT_HUBS.map((h) => h.stationId);
    const days = dateRange('2025-09-14', '2026-10-17').map((date) =>
      day(date, Object.fromEntries(stations.map((s) => [s, { buy: 1234567.89, sell: 1234567.99 }])))
    );
    expect(JSON.stringify(mergeDays(base, null, days)).length).toBeLessThan(60_000);
  });
});

describe('groupByDocument', () => {
  it("collects each type's days ascending, every station of a day together", () => {
    const a = new StationPriceFold(SNAPSHOT_HUBS);
    a.add(JITA, 34, true, 1);
    const b = new StationPriceFold(SNAPSHOT_HUBS);
    b.add(JITA, 34, false, 2);
    b.add(AMARR, 34, true, 3);
    b.add(AMARR, 35, true, 4);
    const groups = groupByDocument(
      new Map([
        ['2026-10-02', b],
        ['2026-10-01', a],
      ])
    );
    expect(groups).toEqual([
      {
        typeId: 34,
        days: [
          { date: '2026-10-01', stations: { [JITA]: { buy: 1, sell: null } } },
          {
            date: '2026-10-02',
            stations: { [JITA]: { buy: null, sell: 2 }, [AMARR]: { buy: 3, sell: null } },
          },
        ],
      },
      { typeId: 35, days: [{ date: '2026-10-02', stations: { [AMARR]: { buy: 4, sell: null } } }] },
    ]);
  });
});

describe('shrunkRegion', () => {
  const fold = new OpenPriceFold([FORGE, DOMAIN]);
  for (let t = 0; t < 10; t++) fold.add(FORGE, t, true, 1);
  for (let t = 0; t < 4; t++) fold.add(DOMAIN, t, true, 1);

  it('has nothing to compare on a first run or a missing region', () => {
    expect(shrunkRegion(fold, null)).toBeNull();
    expect(shrunkRegion(fold, {})).toBeNull();
  });
  it('passes counts at or above half of the previous run', () => {
    expect(shrunkRegion(fold, { [FORGE]: 20, [DOMAIN]: 8 })).toBeNull();
  });
  it('names a region that fell under half', () => {
    expect(shrunkRegion(fold, { [FORGE]: 20, [DOMAIN]: 9 })).toContain(String(DOMAIN));
    expect(shrunkRegion(fold, { [FORGE]: 21 })).toContain(String(FORGE));
  });
  it('regionCounts keys by region id', () => {
    expect(regionCounts(fold)).toEqual({ [FORGE]: 10, [DOMAIN]: 4 });
  });
});
