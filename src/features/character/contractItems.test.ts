import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { corpCacheKey } from '@/esi/cache';
import { loadContractItemsDetailed } from './contractItems';

const CHAR_ID = 91;
const server = mswServer();

beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  configureEsi({ getToken: null });
});

describe('loadContractItemsDetailed (result)', () => {
  it("fetches and caches a contract's item lines under a per-contract key", async () => {
    const items = [
      { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/12345/items`, () =>
        HttpResponse.json(items)
      )
    );

    const { result } = await loadContractItemsDetailed(CHAR_ID, 12345);

    expect(result?.data).toEqual(items);
    expect((await db.esiCache.get([CHAR_ID, 'contract-items:12345']))?.value).toEqual(items);
  });

  it("reads a corporation's contract through the corp route, filed under the corporation", async () => {
    const items = [
      { record_id: 1, type_id: 34, quantity: 5, is_included: true, is_singleton: false },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/98000001/contracts/777/items`, () =>
        HttpResponse.json(items)
      )
    );

    const { result } = await loadContractItemsDetailed(CHAR_ID, 777, 98000001);

    expect(result?.data).toEqual(items);
    expect(
      (await db.esiCache.get([CHAR_ID, corpCacheKey(98000001, 'contract-items:777')]))?.value
    ).toEqual(items);
  });

  it('returns null when unresolvable (offline + uncached)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/999/items`, () =>
        HttpResponse.error()
      )
    );

    const { result } = await loadContractItemsDetailed(CHAR_ID, 999);

    expect(result).toBeNull();
  });
});

describe('loadContractItemsDetailed', () => {
  const items = [
    { record_id: 1, type_id: 34, quantity: 744, is_included: true, is_singleton: false },
  ];

  it('says a first read went to the network and a fresh hit after it did not', async () => {
    let hits = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/21/items`, () => {
        hits += 1;
        return HttpResponse.json(items);
      })
    );
    const first = await loadContractItemsDetailed(CHAR_ID, 21);
    expect(first).toMatchObject({ networkRead: true });
    expect(first.result?.data).toEqual(items);
    const again = await loadContractItemsDetailed(CHAR_ID, 21);
    expect(again.networkRead).toBe(false);
    // A fresh row is `fromCache: false` in production: it is not the signal.
    expect(again.result?.fromCache).toBe(false);
    expect(hits).toBe(1);
  });

  it('reports the status of a definite answer, and 0 when ESI did not answer', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/404/items`, () =>
        HttpResponse.json({ error: 'gone' }, { status: 404 })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/contracts/0/items`, () =>
        HttpResponse.error()
      )
    );
    expect(await loadContractItemsDetailed(CHAR_ID, 404)).toMatchObject({
      result: null,
      networkRead: true,
      failureStatus: 404,
    });
    expect(await loadContractItemsDetailed(CHAR_ID, 0)).toMatchObject({
      result: null,
      failureStatus: 0,
    });
  });
});
