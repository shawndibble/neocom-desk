import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadWalletBalance, loadWalletJournal, loadWalletTransactions } from './wallet';

const CHAR_ID = 91;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadWalletBalance', () => {
  it('fetches from ESI and caches it', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet`, () => HttpResponse.json(1234.5))
    );
    const result = await loadWalletBalance(CHAR_ID);
    expect(result).toEqual({ data: 1234.5, fetchedAt: expect.any(Date), fromCache: false });
    expect((await db.esiCache.get([CHAR_ID, 'wallet:balance']))?.value).toBe(1234.5);
  });

  it('falls back to cache offline', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:balance',
      value: 500,
      fetchedAt: 1,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet`, () => HttpResponse.error())
    );
    const result = await loadWalletBalance(CHAR_ID);
    expect(result).toEqual({ data: 500, fetchedAt: new Date(1), fromCache: true });
  });
});

describe('loadWalletJournal', () => {
  it('concatenates every page and caches the combined result', async () => {
    const page1 = [{ id: 1, date: '2026-08-01T00:00:00Z', ref_type: 'bounty', description: 'a' }];
    const page2 = [{ id: 2, date: '2026-08-02T00:00:00Z', ref_type: 'bounty', description: 'b' }];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet/journal`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json(page === '2' ? page2 : page1, { headers: { 'X-Pages': '2' } });
      })
    );
    const result = await loadWalletJournal(CHAR_ID);
    expect(result?.data).toEqual([...page1, ...page2]);
    expect(result?.fromCache).toBe(false);
    expect((await db.esiCache.get([CHAR_ID, 'wallet:journal']))?.value).toEqual([
      ...page1,
      ...page2,
    ]);
  });

  it('returns null when ESI fails and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet/journal`, () => HttpResponse.error())
    );
    expect(await loadWalletJournal(CHAR_ID)).toBeNull();
  });
});

describe('loadWalletTransactions', () => {
  it('fetches and caches transactions', async () => {
    const txns = [
      {
        transaction_id: 1,
        date: '2026-08-01T00:00:00Z',
        location_id: 1,
        type_id: 34,
        unit_price: 5,
        quantity: 1,
        client_id: 1,
        is_buy: true,
        is_personal: true,
        journal_ref_id: 1,
      },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet/transactions`, ({ request }) => {
        const fromId = new URL(request.url).searchParams.get('from_id');
        return HttpResponse.json(fromId === null ? txns : []);
      })
    );
    const result = await loadWalletTransactions(CHAR_ID);
    expect(result?.data).toEqual(txns);
  });
});
