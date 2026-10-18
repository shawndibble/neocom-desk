import { describe, expect, it } from 'vitest';
import {
  MARKET_OPEN_PRICES_MAX_DAYS,
  OpenPriceFold,
  addDays,
  dateRange,
  dayIndexUrl,
  groupByDocument,
  implausibleReason,
  isIsoDate,
  mergeDays,
  openPriceDocId,
  pickLastSnapshotUrl,
  regionCounts,
  shrunkRegion,
  previousUtcDate,
} from './marketOpenPrices.js';

const FORGE = 10000002;
const DOMAIN = 10000043;

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

describe('pickLastSnapshotUrl', () => {
  const file = (time: string, name = `market-orders-${time}.v3.csv.bz2`) => ({
    file_time: time,
    name,
    url: `https://x/${name}`,
  });

  it('picks the file with the latest file_time on that day', () => {
    const listing = {
      files: [
        file('2026-10-17T23:45:06Z'),
        file('2026-10-17T00:15:05Z'),
        file('2026-10-17T12:15:05Z'),
      ],
    };
    expect(pickLastSnapshotUrl(listing, '2026-10-17')).toBe(
      'https://x/market-orders-2026-10-17T23:45:06Z.v3.csv.bz2'
    );
  });
  it('ignores other days and non-bz2 files', () => {
    const listing = {
      files: [file('2026-10-18T00:15:05Z'), file('2026-10-17T23:45:06Z', 'readme.txt')],
    };
    expect(pickLastSnapshotUrl(listing, '2026-10-17')).toBeNull();
  });
  it('is null for a malformed or empty listing', () => {
    expect(pickLastSnapshotUrl(null, '2026-10-17')).toBeNull();
    expect(pickLastSnapshotUrl({}, '2026-10-17')).toBeNull();
    expect(pickLastSnapshotUrl({ files: [{ file_time: 1 }, 'x'] }, '2026-10-17')).toBeNull();
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
    const byKey = new Map(
      [...fold.entries()].map((e) => [openPriceDocId(e.regionId, e.typeId), e])
    );
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

describe('mergeDays', () => {
  const base = { regionId: FORGE, typeId: 34 };

  it('starts a series from nothing', () => {
    expect(mergeDays(base, null, [{ date: '2026-10-17', buy: 5, sell: 6 }])).toEqual({
      ...base,
      dates: ['2026-10-17'],
      buy: [5],
      sell: [6],
    });
  });
  it('appends in order and does not invent days for gaps', () => {
    const first = mergeDays(base, null, [{ date: '2026-10-10', buy: 1, sell: 2 }]);
    const next = mergeDays(base, first, [{ date: '2026-10-17', buy: null, sell: 4 }]);
    expect(next.dates).toEqual(['2026-10-10', '2026-10-17']);
    expect(next.buy).toEqual([1, null]);
    expect(next.sell).toEqual([2, 4]);
  });
  it('is idempotent: re-running a day replaces that entry', () => {
    const once = mergeDays(base, null, [{ date: '2026-10-17', buy: 5, sell: 6 }]);
    const again = mergeDays(base, once, [{ date: '2026-10-17', buy: 7, sell: 8 }]);
    expect(again.dates).toEqual(['2026-10-17']);
    expect([again.buy, again.sell]).toEqual([[7], [8]]);
    expect(mergeDays(base, again, [{ date: '2026-10-17', buy: 7, sell: 8 }])).toEqual(again);
  });
  it('slots an older day in order (backfill after the daily job)', () => {
    const live = mergeDays(base, null, [{ date: '2026-10-17', buy: 5, sell: 6 }]);
    const back = mergeDays(base, live, [
      { date: '2026-10-16', buy: 3, sell: 4 },
      { date: '2026-10-15', buy: 1, sell: 2 },
    ]);
    expect(back.dates).toEqual(['2026-10-15', '2026-10-16', '2026-10-17']);
    expect(back.buy).toEqual([1, 3, 5]);
  });
  it('caps at the newest 400 days', () => {
    const days = dateRange('2025-01-01', '2026-12-31').map((date, i) => ({
      date,
      buy: i,
      sell: i,
    }));
    const merged = mergeDays(base, null, days);
    expect(merged.dates).toHaveLength(MARKET_OPEN_PRICES_MAX_DAYS);
    expect(merged.dates.at(-1)).toBe('2026-12-31');
    expect(merged.buy.at(-1)).toBe(days.length - 1);
    expect(merged.dates).toEqual([...merged.dates].sort());
  });
  it('trusts a ragged stored series only up to its shortest array', () => {
    const merged = mergeDays(
      base,
      { dates: ['2026-10-01', '2026-10-02'], buy: [1], sell: [2, 3] },
      [{ date: '2026-10-03', buy: 9, sell: 9 }]
    );
    expect(merged.dates).toEqual(['2026-10-01', '2026-10-03']);
    expect(merged.buy).toEqual([1, 9]);
  });
});

describe('groupByDocument', () => {
  it("collects each document's days ascending", () => {
    const a = new OpenPriceFold();
    a.add(FORGE, 34, true, 1);
    const b = new OpenPriceFold();
    b.add(FORGE, 34, false, 2);
    b.add(DOMAIN, 34, true, 3);
    const groups = groupByDocument(
      new Map([
        ['2026-10-02', b],
        ['2026-10-01', a],
      ])
    );
    expect(groups).toEqual([
      {
        regionId: FORGE,
        typeId: 34,
        days: [
          { date: '2026-10-01', buy: 1, sell: null },
          { date: '2026-10-02', buy: null, sell: 2 },
        ],
      },
      { regionId: DOMAIN, typeId: 34, days: [{ date: '2026-10-02', buy: 3, sell: null }] },
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
