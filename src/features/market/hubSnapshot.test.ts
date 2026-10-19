import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTradeHub } from '@/market/hubs';
import {
  loadHubSnapshotRange,
  miningPricesUrl,
  parseMiningPricesMonth,
  resetHubSnapshotCache,
} from './hubSnapshot';

const fetchMock = vi.fn();

function serve(objects: Record<string, unknown>, failing: string[] = []) {
  fetchMock.mockImplementation(async (url: string) => {
    if (failing.includes(url)) return new Response('boom', { status: 500 });
    if (!(url in objects)) return new Response('', { status: 404 });
    return new Response(JSON.stringify(objects[url]), { status: 200 });
  });
}

const jita = getTradeHub('jita')!;
const amarr = getTradeHub('amarr')!;
const url = (hub = jita, month: string) => miningPricesUrl(hub, month);

beforeEach(() => {
  resetHubSnapshotCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('loadHubSnapshotRange', () => {
  it('splits days by tier and reads only the days in range', async () => {
    serve({
      [url(jita, '2026-09')]: {
        hub: 'jita',
        month: '2026-09',
        days: {
          '2026-09-23': { tier: 'saved', prices: { 34: [9, 9] } }, // before the range
          '2026-09-24': { tier: 'saved', prices: { 34: [3.6, 3.8], 35: [null, 7] } },
          '2026-09-25': { tier: 'historical', prices: { 34: [1, 2] } },
        },
      },
    });

    const result = await loadHubSnapshotRange('2026-09-24', '2026-09-25');

    expect(result.saved.get('2026-09-24')?.get(34)).toEqual({ buy: 3.6, sell: 3.8 });
    expect(result.saved.get('2026-09-24')?.get(35)).toEqual({ buy: null, sell: 7 });
    expect(result.historical.get('2026-09-25')?.get(34)).toEqual({ buy: 1, sell: 2 });
    expect(result.saved.has('2026-09-23')).toBe(false);
  });

  it('reads every month object a range spans, and a missing month is just empty', async () => {
    serve({
      [url(amarr, '2026-08')]: {
        days: { '2026-08-31': { tier: 'saved', prices: { 34: [1, 2] } } },
      },
      [url(amarr, '2026-10')]: {
        days: { '2026-10-01': { tier: 'saved', prices: { 34: [5, 6] } } },
      },
    });

    const result = await loadHubSnapshotRange('2026-08-31', '2026-10-01', amarr);

    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([
      url(amarr, '2026-08'),
      url(amarr, '2026-09'),
      url(amarr, '2026-10'),
    ]);
    expect([...result.saved.keys()]).toEqual(['2026-08-31', '2026-10-01']);
  });

  it('crosses a year boundary', async () => {
    serve({});
    await loadHubSnapshotRange('2026-12-31', '2027-01-01');
    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([
      url(jita, '2026-12'),
      url(jita, '2027-01'),
    ]);
  });

  it('treats a failed or malformed month as empty and retries a failure next time', async () => {
    serve({ [url(jita, '2026-09')]: { days: 'nope' } }, [url(jita, '2026-10')]);

    const first = await loadHubSnapshotRange('2026-09-30', '2026-10-01');
    expect(first.saved.size).toBe(0);

    serve({
      [url(jita, '2026-10')]: {
        days: { '2026-10-01': { tier: 'saved', prices: { 34: [1, 2] } } },
      },
    });
    const second = await loadHubSnapshotRange('2026-10-01', '2026-10-01');
    expect(second.saved.get('2026-10-01')?.get(34)).toEqual({ buy: 1, sell: 2 });
  });

  it('holds a good month so a second read costs no fetch', async () => {
    serve({ [url(jita, '2026-10')]: { days: {} } });
    await loadHubSnapshotRange('2026-10-01', '2026-10-02');
    await loadHubSnapshotRange('2026-10-03', '2026-10-04');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is empty without fetching when the range is backwards', async () => {
    const result = await loadHubSnapshotRange('2026-09-24', '2026-09-01');
    expect(result).toEqual({ saved: new Map(), historical: new Map() });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('parseMiningPricesMonth', () => {
  it('skips malformed days and prices', () => {
    const parsed = parseMiningPricesMonth({
      days: {
        '2026-10-01': { tier: 'saved', prices: { 34: [1, 2], 35: ['x', 2], abc: [1, 1] } },
        '2026-10-02': { tier: 'other', prices: {} },
        nope: { tier: 'saved', prices: {} },
      },
    });
    expect([...parsed.keys()]).toEqual(['2026-10-01']);
    expect([...parsed.get('2026-10-01')!.prices.keys()]).toEqual([34]);
  });

  it('is empty for something that is not a month object', () => {
    expect(parseMiningPricesMonth(null).size).toBe(0);
    expect(parseMiningPricesMonth([]).size).toBe(0);
  });
});
