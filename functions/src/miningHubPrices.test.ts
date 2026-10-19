import { describe, expect, it } from 'vitest';
import {
  MINING_PRICES_MAX_DAYS,
  SNAPSHOT_HUBS,
  StationPriceFold,
  expiredMiningMonthKeys,
  groupByMonthObject,
  keepMiningDaysFrom,
  marketHistoryWrites,
  mergeMiningMonth,
  miningPricesR2Key,
  stationFoldWrites,
} from './miningHubPrices.js';

const JITA = 60003760;
const AMARR = 60008494;
const ELSEWHERE = 60003761;

describe('StationPriceFold', () => {
  const fold = () => new StationPriceFold(SNAPSHOT_HUBS, [34, 35, 18]);

  it('keeps the highest buy and lowest sell per hub station and type', () => {
    const f = fold();
    f.add(JITA, 34, true, 4);
    f.add(JITA, 34, true, 5);
    f.add(JITA, 34, false, 7);
    f.add(JITA, 34, false, 6);
    f.add(AMARR, 34, false, 9);
    expect(f.prices(JITA)).toEqual({ 34: [5, 6] });
    expect(f.prices(AMARR)).toEqual({ 34: [null, 9] });
  });

  it('counts only orders placed at the station, whatever their range', () => {
    // A region-range buy order placed elsewhere in The Forge does not count as
    // a Jita 4-4 buy (Fuzzwork's station aggregate, orderBook.ts's rule).
    const f = fold();
    f.add(ELSEWHERE, 34, true, 100);
    f.add(JITA, 34, true, 5);
    expect(f.prices(JITA)).toEqual({ 34: [5, null] });
  });

  it('ignores non-mining types, non-hub stations and unusable prices', () => {
    const f = fold();
    f.add(JITA, 587, false, 10);
    f.add(ELSEWHERE, 35, false, 10);
    f.add(JITA, 35, false, 0);
    f.add(JITA, 35, false, Number.NaN);
    f.add(JITA, 35, true, -1);
    expect(f.prices(JITA)).toEqual({});
  });
});

describe('stationFoldWrites', () => {
  it('writes one saved day per hub that has prices and skips an empty hub', () => {
    const f = new StationPriceFold(SNAPSHOT_HUBS, [34]);
    f.add(JITA, 34, true, 5);
    expect(stationFoldWrites(f, SNAPSHOT_HUBS, '2026-10-17')).toEqual([
      { hubId: 'jita', date: '2026-10-17', day: { tier: 'saved', prices: { 34: [5, null] } } },
    ]);
  });

  it('keeps only the mining types when the fold holds every type (the open-prices fold)', () => {
    const f = new StationPriceFold(SNAPSHOT_HUBS);
    f.add(JITA, 34, true, 5);
    f.add(JITA, 587, true, 9);
    f.add(AMARR, 587, true, 9);
    expect(stationFoldWrites(f, SNAPSHOT_HUBS, '2026-10-17', [34])).toEqual([
      { hubId: 'jita', date: '2026-10-17', day: { tier: 'saved', prices: { 34: [5, null] } } },
    ]);
  });
});

describe('miningPricesR2Key', () => {
  it('is one object per hub per month', () => {
    expect(miningPricesR2Key('amarr', '2026-10')).toBe('mining-prices/amarr/2026-10.json');
  });
});

describe('groupByMonthObject', () => {
  it('splits by hub and month and lets a later write of the same date win', () => {
    const day = (buy: number) => ({
      tier: 'saved' as const,
      prices: { 34: [buy, null] as [number, null] },
    });
    const groups = groupByMonthObject([
      { hubId: 'jita', date: '2026-09-30', day: day(1) },
      { hubId: 'jita', date: '2026-10-01', day: day(2) },
      { hubId: 'amarr', date: '2026-10-01', day: day(3) },
      { hubId: 'jita', date: '2026-10-01', day: day(4) },
    ]);
    expect(groups).toEqual([
      {
        key: 'mining-prices/jita/2026-09.json',
        hubId: 'jita',
        month: '2026-09',
        days: { '2026-09-30': day(1) },
      },
      {
        key: 'mining-prices/jita/2026-10.json',
        hubId: 'jita',
        month: '2026-10',
        days: { '2026-10-01': day(4) },
      },
      {
        key: 'mining-prices/amarr/2026-10.json',
        hubId: 'amarr',
        month: '2026-10',
        days: { '2026-10-01': day(3) },
      },
    ]);
  });
});

describe('mergeMiningMonth', () => {
  const saved = (buy: number) => ({
    tier: 'saved' as const,
    prices: { 34: [buy, 2] as [number, number] },
  });
  const base = { hubId: 'jita', month: '2026-10' };

  it('creates a missing object', () => {
    expect(mergeMiningMonth(base, null, { '2026-10-02': saved(1) }, '2025-01-01')).toEqual({
      hub: 'jita',
      month: '2026-10',
      days: { '2026-10-02': saved(1) },
    });
  });

  it('keeps stored days, replaces a re-written day whole and sorts by date', () => {
    const existing = {
      hub: 'jita',
      month: '2026-10',
      days: { '2026-10-03': saved(3), '2026-10-01': saved(1) },
    };
    const merged = mergeMiningMonth(
      base,
      existing,
      { '2026-10-03': saved(9), '2026-10-02': saved(2) },
      '2025-01-01'
    );
    expect(Object.keys(merged.days)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(merged.days['2026-10-03']).toEqual(saved(9));
  });

  it('drops days before the retention start and malformed stored days', () => {
    const existing = {
      hub: 'jita',
      month: '2025-09',
      days: {
        '2025-09-01': saved(1),
        '2025-09-20': saved(2),
        '2025-09-21': { tier: 'bogus' },
        nope: saved(3),
      },
    };
    const merged = mergeMiningMonth(
      { hubId: 'jita', month: '2025-09' },
      existing,
      {},
      '2025-09-15'
    );
    expect(merged.days).toEqual({ '2025-09-20': saved(2) });
  });

  it('treats a malformed object as missing', () => {
    expect(mergeMiningMonth(base, 'garbage', {}, '2025-01-01').days).toEqual({});
  });
});

describe('retention', () => {
  it('keeps 400 days counting the published one', () => {
    expect(MINING_PRICES_MAX_DAYS).toBe(400);
    expect(keepMiningDaysFrom('2026-10-17')).toBe('2025-09-13');
  });

  it('expires the two months before the retention start for every hub', () => {
    expect(expiredMiningMonthKeys('2026-10-17', SNAPSHOT_HUBS)).toEqual(
      SNAPSHOT_HUBS.flatMap((h) => [
        `mining-prices/${h.id}/2025-08.json`,
        `mining-prices/${h.id}/2025-07.json`,
      ])
    );
    expect(expiredMiningMonthKeys('2026-02-03', [SNAPSHOT_HUBS[0]])).toEqual([
      'mining-prices/jita/2024-11.json',
      'mining-prices/jita/2024-10.json',
    ]);
  });
});

describe('marketHistoryWrites (the one-time Firestore migration)', () => {
  const doc = (source: string, hubs: Record<string, Record<string, unknown>>) => ({
    hubs,
    source,
    updatedAt: 1,
  });

  it("maps 'fuzzwork' days to saved and 'adam4eve' days to historical, per station", () => {
    const writes = marketHistoryWrites(
      [
        {
          date: '2026-10-01',
          data: doc('fuzzwork', {
            [JITA]: { 34: { buy: 5, sell: 6, buyCount: 4, sellCount: 4 } },
            [AMARR]: { 34: { buy: null, sell: 7, buyCount: 0, sellCount: 2 } },
          }),
        },
        { date: '2026-07-20', data: doc('adam4eve', { [JITA]: { 35: { buy: 1, sell: 2 } } }) },
      ],
      SNAPSHOT_HUBS
    );
    expect(writes).toEqual([
      { hubId: 'jita', date: '2026-10-01', day: { tier: 'saved', prices: { 34: [5, 6] } } },
      { hubId: 'amarr', date: '2026-10-01', day: { tier: 'saved', prices: { 34: [null, 7] } } },
      { hubId: 'jita', date: '2026-07-20', day: { tier: 'historical', prices: { 35: [1, 2] } } },
    ]);
  });

  it('skips unknown tags, bad dates, unknown stations and priceless types', () => {
    const writes = marketHistoryWrites(
      [
        { date: '2026-10-01', data: doc('other', { [JITA]: { 34: { buy: 1, sell: 1 } } }) },
        { date: 'nope', data: doc('fuzzwork', { [JITA]: { 34: { buy: 1, sell: 1 } } }) },
        { date: '2026-10-02', data: doc('fuzzwork', { 1: { 34: { buy: 1, sell: 1 } } }) },
        {
          date: '2026-10-03',
          data: doc('fuzzwork', { [JITA]: { 34: { buy: null, sell: null } } }),
        },
        { date: '2026-10-04', data: null },
      ],
      SNAPSHOT_HUBS
    );
    expect(writes).toEqual([]);
  });
});
