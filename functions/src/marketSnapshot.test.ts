import { describe, expect, it } from 'vitest';
import {
  buildAdam4eveHistoryUrl,
  buildFuzzworkUrl,
  chunk,
  dateRange,
  foldHubPriceCapture,
  isOutsideRetention,
  missingBackfillDates,
  parseAdam4eveHistoryResponse,
  parseFuzzworkAggregates,
  shiftDateString,
  utcDateString,
} from './marketSnapshot.js';

describe('date helpers', () => {
  it('utcDateString formats in UTC', () => {
    expect(utcDateString(new Date(Date.UTC(2026, 8, 25, 23, 59)))).toBe('2026-09-25');
  });

  it('shiftDateString shifts by whole days, crossing month/year boundaries', () => {
    expect(shiftDateString('2026-09-25', -1)).toBe('2026-09-24');
    expect(shiftDateString('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('dateRange lists every day inclusive, oldest first', () => {
    expect(dateRange('2026-09-23', '2026-09-25')).toEqual([
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
    ]);
  });

  it('dateRange is empty when start is after end', () => {
    expect(dateRange('2026-09-25', '2026-09-23')).toEqual([]);
  });

  it('isOutsideRetention counts today as day one of the window', () => {
    expect(isOutsideRetention('2026-06-27', '2026-09-25')).toBe(true);
    expect(isOutsideRetention('2026-06-28', '2026-09-25')).toBe(false);
  });

  it('missingBackfillDates lists gaps in the window, excluding today', () => {
    const existing = new Set(['2026-09-24']);
    const missing = missingBackfillDates(existing, '2026-09-25');
    expect(missing).toHaveLength(88);
    expect(missing[0]).toBe('2026-06-28');
    expect(missing).not.toContain('2026-09-24');
    expect(missing).not.toContain('2026-09-25');
  });
});

describe('chunk', () => {
  it('splits into fixed-size groups, last one short', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('throws on a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('Fuzzwork', () => {
  it('builds the aggregates URL with station and comma-separated types', () => {
    const url = new URL(buildFuzzworkUrl(60003760, [34, 35]));
    expect(url.origin + url.pathname).toBe('https://market.fuzzwork.co.uk/aggregates/');
    expect(url.searchParams.get('station')).toBe('60003760');
    expect(url.searchParams.get('types')).toBe('34,35');
  });

  it('parses buy.max / sell.min, every requested type present', () => {
    const body = {
      '34': {
        buy: { max: '3.61', orderCount: '22' },
        sell: { min: '3.77', orderCount: '33' },
      },
    };
    const result = parseFuzzworkAggregates(body, [34, 35]);
    expect(result.get(34)).toEqual({ buy: 3.61, sell: 3.77 });
    expect(result.get(35)).toEqual({ buy: null, sell: null });
  });

  it('reports null for a side with zero orders even if a price field is present', () => {
    const body = { '34': { buy: { max: '3.61', orderCount: '0' } } };
    expect(parseFuzzworkAggregates(body, [34]).get(34)).toEqual({ buy: null, sell: null });
  });
});

describe('Adam4EVE', () => {
  it('builds the history URL with typeID/regionID/start/end', () => {
    const url = new URL(buildAdam4eveHistoryUrl([34, 35], 10000002, '2026-06-28', '2026-09-24'));
    expect(url.searchParams.get('typeID')).toBe('34,35');
    expect(url.searchParams.get('regionID')).toBe('10000002');
    expect(url.searchParams.get('start')).toBe('2026-06-28');
    expect(url.searchParams.get('end')).toBe('2026-09-24');
  });

  it('parses buy_price_high/sell_price_high per type per date', () => {
    const json = [
      {
        type_id: '62454',
        price_date: '2026-09-24',
        buy_price_high: '933.1',
        sell_price_high: '1141',
      },
    ];
    const result = parseAdam4eveHistoryResponse(json);
    expect(result.get(62454)?.get('2026-09-24')).toEqual({ buy: 933.1, sell: 1141 });
  });

  it('reports a side null when its price field is missing or unparsable', () => {
    const json = [{ type_id: '34', price_date: '2026-09-24', sell_price_high: '3.68' }];
    expect(parseAdam4eveHistoryResponse(json).get(34)?.get('2026-09-24')).toEqual({
      buy: null,
      sell: 3.68,
    });
  });

  it('drops a row with no numeric type_id or no date-shaped price_date', () => {
    const json = [
      { type_id: 'not-a-number', price_date: '2026-09-24', buy_price_high: '1' },
      { type_id: '34', price_date: 'not-a-date', buy_price_high: '1' },
    ];
    expect(parseAdam4eveHistoryResponse(json).size).toBe(0);
  });

  it('is empty for a non-array response', () => {
    expect(parseAdam4eveHistoryResponse({ error: 'nope' }).size).toBe(0);
  });
});

describe('foldHubPriceCapture', () => {
  it('takes the first capture outright', () => {
    expect(foldHubPriceCapture(undefined, { buy: 100, sell: 110 })).toEqual({
      buy: 100,
      sell: 110,
      buyCount: 1,
      sellCount: 1,
    });
  });

  it('averages a second capture into the running mean', () => {
    const first = foldHubPriceCapture(undefined, { buy: 100, sell: 110 });
    const second = foldHubPriceCapture(first, { buy: 200, sell: 130 });
    expect(second).toEqual({ buy: 150, sell: 120, buyCount: 2, sellCount: 2 });
  });

  it('leaves a side untouched when this capture has no orders on it', () => {
    const first = foldHubPriceCapture(undefined, { buy: 100, sell: 110 });
    const second = foldHubPriceCapture(first, { buy: null, sell: 130 });
    expect(second).toEqual({ buy: 100, sell: 120, buyCount: 1, sellCount: 2 });
  });

  it('matches a hand-computed 4-capture average', () => {
    let day = foldHubPriceCapture(undefined, { buy: 10, sell: null });
    day = foldHubPriceCapture(day, { buy: 20, sell: 100 });
    day = foldHubPriceCapture(day, { buy: 30, sell: 200 });
    day = foldHubPriceCapture(day, { buy: 40, sell: null });
    expect(day.buy).toBeCloseTo(25); // (10+20+30+40)/4
    expect(day.sell).toBeCloseTo(150); // (100+200)/2
    expect(day).toMatchObject({ buyCount: 4, sellCount: 2 });
  });
});
