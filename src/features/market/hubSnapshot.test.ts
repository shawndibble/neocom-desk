import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTradeHub } from '@/market/hubs';
import { loadHubSnapshotRange } from './hubSnapshot';
import { openPricesUrl, resetMarketOpenPricesCache } from './marketOpenPrices';

const fetchMock = vi.fn();

function serve(objects: Record<number, unknown>, failing: number[] = []) {
  fetchMock.mockImplementation(async (url: string) => {
    const typeId = Number(url.match(/open-prices\/(\d+)\.json$/)?.[1]);
    if (failing.includes(typeId)) return new Response('boom', { status: 500 });
    if (!(typeId in objects)) return new Response('', { status: 404 });
    return new Response(JSON.stringify(objects[typeId]), { status: 200 });
  });
}

const jita = getTradeHub('jita')!;
const amarr = getTradeHub('amarr')!;

beforeEach(() => {
  resetMarketOpenPricesCache();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('loadHubSnapshotRange', () => {
  it("reads the hub station's open prices as saved days, only the days in range", async () => {
    serve({
      34: {
        typeId: 34,
        dates: ['2026-09-23', '2026-09-24', '2026-09-25'],
        stations: {
          [jita.stationId]: { buy: [9, 3.6, null], sell: [9, 3.8, null] },
          [amarr.stationId]: { buy: [1, 1, 1], sell: [1, 1, 1] },
        },
      },
      35: {
        typeId: 35,
        dates: ['2026-09-24'],
        stations: { [jita.stationId]: { buy: [null], sell: [7] } },
      },
    });

    const result = await loadHubSnapshotRange('2026-09-24', '2026-09-25', [34, 35]);

    expect(fetchMock.mock.calls.map(([u]) => u)).toEqual([openPricesUrl(34), openPricesUrl(35)]);
    expect(result.saved.get('2026-09-24')?.get(34)).toEqual({ buy: 3.6, sell: 3.8 });
    expect(result.saved.get('2026-09-24')?.get(35)).toEqual({ buy: null, sell: 7 });
    // Neither side priced at the station that day: no day at all.
    expect(result.saved.has('2026-09-25')).toBe(false);
    expect(result.saved.has('2026-09-23')).toBe(false);
  });

  it('treats a missing, failed or malformed object as no days and retries a failure next time', async () => {
    serve({ 35: { dates: 'nope' } }, [34]);

    const first = await loadHubSnapshotRange('2026-10-01', '2026-10-01', [34, 35, 36]);
    expect(first.saved.size).toBe(0);

    serve({
      34: { dates: ['2026-10-01'], stations: { [jita.stationId]: { buy: [1], sell: [2] } } },
    });
    const second = await loadHubSnapshotRange('2026-10-01', '2026-10-01', [34]);
    expect(second.saved.get('2026-10-01')?.get(34)).toEqual({ buy: 1, sell: 2 });
  });

  it('holds a good object so a second read costs no fetch, and reads each type once', async () => {
    serve({ 34: { dates: ['2026-10-01'], stations: {} } });
    await loadHubSnapshotRange('2026-10-01', '2026-10-02', [34, 34]);
    await loadHubSnapshotRange('2026-10-03', '2026-10-04', [34], amarr);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('is empty without fetching when the range is backwards or there are no types', async () => {
    const empty = { saved: new Map() };
    expect(await loadHubSnapshotRange('2026-09-24', '2026-09-01', [34])).toEqual(empty);
    expect(await loadHubSnapshotRange('2026-09-01', '2026-09-24', [])).toEqual(empty);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
