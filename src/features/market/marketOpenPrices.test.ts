import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocMock, listMock, syncConfigured } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  listMock: vi.fn(),
  syncConfigured: { value: true },
}));
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  getDoc: getDocMock,
  collection: listMock,
  getDocs: listMock,
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFirestore: () => ({}) }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => syncConfigured.value }));

import {
  loadMarketOpenPrices,
  parseOpenPriceSeries,
  resetMarketOpenPricesCache,
} from './marketOpenPrices';

const DOC = {
  regionId: 10000002,
  typeId: 34,
  dates: ['2026-10-01', '2026-10-02'],
  buy: [5, null],
  sell: [6, 7],
};

function serve(data: unknown) {
  getDocMock.mockResolvedValue({ exists: () => data !== undefined, data: () => data });
}

beforeEach(() => {
  getDocMock.mockReset();
  listMock.mockReset();
  syncConfigured.value = true;
  resetMarketOpenPricesCache();
});

describe('parseOpenPriceSeries', () => {
  it('reads the parallel arrays', () => {
    expect(parseOpenPriceSeries(DOC)).toEqual({
      dates: DOC.dates,
      buy: DOC.buy,
      sell: DOC.sell,
    });
  });

  it('rejects anything not shaped like a series', () => {
    expect(parseOpenPriceSeries(undefined)).toBeNull();
    expect(parseOpenPriceSeries({ dates: [], buy: [], sell: [] })).toBeNull();
    expect(parseOpenPriceSeries({ dates: ['2026-10-01'], buy: ['x'], sell: [1] })).toBeNull();
  });
});

describe('loadMarketOpenPrices', () => {
  it('reads one document by region_type id, never listing', async () => {
    serve(DOC);
    const series = await loadMarketOpenPrices(10000002, 34);
    expect(series?.dates).toEqual(DOC.dates);
    expect(getDocMock.mock.calls.map(([ref]) => (ref as { path: string }).path)).toEqual([
      'marketOpenPrices/10000002_34',
    ]);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('holds the answer, a missing document included, so a reopen reads nothing', async () => {
    serve(undefined);
    expect(await loadMarketOpenPrices(1, 2, 1000)).toBeNull();
    expect(await loadMarketOpenPrices(1, 2, 2000)).toBeNull();
    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  it('reads again once the hold lapses', async () => {
    serve(DOC);
    await loadMarketOpenPrices(1, 2, 0);
    await loadMarketOpenPrices(1, 2, 2 * 60 * 60_000);
    expect(getDocMock).toHaveBeenCalledTimes(2);
  });

  it('is null, without a read, when Firebase is not configured', async () => {
    syncConfigured.value = false;
    expect(await loadMarketOpenPrices(1, 2)).toBeNull();
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it('is null on a failed read (offline) and tries again next time', async () => {
    getDocMock.mockRejectedValueOnce(new Error('offline'));
    expect(await loadMarketOpenPrices(1, 2)).toBeNull();
    serve(DOC);
    expect((await loadMarketOpenPrices(1, 2))?.buy).toEqual(DOC.buy);
  });
});
