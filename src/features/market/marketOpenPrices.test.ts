import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getDocMock, listMock, syncConfigured, firestoreThrows } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  listMock: vi.fn(),
  syncConfigured: { value: true },
  firestoreThrows: { value: false },
}));
vi.mock('firebase/firestore/lite', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ path: `${collection}/${id}` }),
  getDoc: getDocMock,
  collection: listMock,
  getDocs: listMock,
}));
vi.mock('@/sync/firebaseApp', () => ({
  getSyncFirestore: () => {
    if (firestoreThrows.value) throw new Error('bad config');
    return {};
  },
}));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => syncConfigured.value }));

import {
  loadMarketOpenPrices,
  parseOpenPricesByType,
  resetMarketOpenPricesCache,
} from './marketOpenPrices';

const FORGE = 10000002;
const DOMAIN = 10000043;
const DOC = {
  typeId: 34,
  dates: ['2026-10-01', '2026-10-02'],
  regions: {
    [FORGE]: { buy: [5, null], sell: [6, 7] },
    [DOMAIN]: { buy: [1, 2], sell: [3, 4] },
  },
};

function serve(data: unknown) {
  getDocMock.mockResolvedValue({ exists: () => data !== undefined, data: () => data });
}

beforeEach(() => {
  getDocMock.mockReset();
  listMock.mockReset();
  syncConfigured.value = true;
  firestoreThrows.value = false;
  resetMarketOpenPricesCache();
});

describe('parseOpenPricesByType', () => {
  it('reads each region as a series over the shared dates', () => {
    const parsed = parseOpenPricesByType(DOC);
    expect(parsed?.get(FORGE)).toEqual({ dates: DOC.dates, buy: [5, null], sell: [6, 7] });
    expect(parsed?.get(DOMAIN)?.buy).toEqual([1, 2]);
  });

  it('skips a malformed region and rejects anything not shaped like a type document', () => {
    expect(
      parseOpenPricesByType({ ...DOC, regions: { ...DOC.regions, 1: { buy: ['x'], sell: [] } } })
        ?.size
    ).toBe(2);
    expect(parseOpenPricesByType(undefined)).toBeNull();
    expect(parseOpenPricesByType({ dates: [], regions: {} })).toBeNull();
    expect(parseOpenPricesByType({ dates: ['2026-10-01'] })).toBeNull();
  });
});

describe('loadMarketOpenPrices', () => {
  it('reads one document per type, never listing, and serves every region from it', async () => {
    serve(DOC);
    const [forge, domain, other] = await Promise.all([
      loadMarketOpenPrices(FORGE, 34),
      loadMarketOpenPrices(DOMAIN, 34),
      loadMarketOpenPrices(10000001, 34),
    ]);
    expect(forge?.sell).toEqual([6, 7]);
    expect(domain?.buy).toEqual([1, 2]);
    // A compared non-hub region simply has no open series.
    expect(other).toBeNull();
    expect(getDocMock.mock.calls.map(([ref]) => (ref as { path: string }).path)).toEqual([
      'marketOpenPricesByType/34',
    ]);
    expect(listMock).not.toHaveBeenCalled();
  });

  it('holds the answer, a missing document included, so a reopen reads nothing', async () => {
    serve(undefined);
    expect(await loadMarketOpenPrices(1, 2, 1000)).toBeNull();
    expect(await loadMarketOpenPrices(3, 2, 2000)).toBeNull();
    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  it('reads again once the hold lapses', async () => {
    serve(DOC);
    await loadMarketOpenPrices(FORGE, 2, 0);
    await loadMarketOpenPrices(FORGE, 2, 2 * 60 * 60_000);
    expect(getDocMock).toHaveBeenCalledTimes(2);
  });

  it('is null, without a read, when Firebase is not configured', async () => {
    syncConfigured.value = false;
    expect(await loadMarketOpenPrices(1, 2)).toBeNull();
    expect(getDocMock).not.toHaveBeenCalled();
  });

  it('is null, never a rejection, when Firestore cannot even be set up', async () => {
    firestoreThrows.value = true;
    await expect(loadMarketOpenPrices(FORGE, 2)).resolves.toBeNull();
  });

  it('is null on a failed read (offline) and tries again next time', async () => {
    getDocMock.mockRejectedValueOnce(new Error('offline'));
    expect(await loadMarketOpenPrices(FORGE, 2)).toBeNull();
    serve(DOC);
    expect((await loadMarketOpenPrices(FORGE, 2))?.buy).toEqual([5, null]);
  });
});
