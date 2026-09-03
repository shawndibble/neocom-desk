import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { corpCacheKey } from '@/esi/cache';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { db } from '@/db';
import {
  KEYS,
  loadCorporationDivisions,
  loadCorporationWalletJournal,
  loadCorporationWallets,
} from './wallet';

const CHAR_ID = 91;
const CORP_ID = 98000001;

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

const WALLETS = [
  { division: 1, balance: 1000 },
  { division: 2, balance: 250 },
];

function entry(id: number) {
  return {
    id,
    date: '2026-08-02T00:00:00Z',
    ref_type: 'corporate_reward_payout',
    description: `Entry ${id}`,
    amount: id * 10,
    balance: 1000,
  };
}

describe('loadCorporationWallets', () => {
  it('caches the balances under a corp-scoped key', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}/wallets`, () => HttpResponse.json(WALLETS))
    );

    const result = await loadCorporationWallets(CHAR_ID, CORP_ID);

    expect(result.cached?.data).toEqual(WALLETS);
    expect((await db.esiCache.get([CHAR_ID, corpCacheKey(CORP_ID, KEYS.wallets)]))?.value).toEqual(
      WALLETS
    );
  });

  it('treats a 403 as the in-game role gate, not a re-login prompt', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}/wallets`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );

    const result = await loadCorporationWallets(CHAR_ID, CORP_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached).toBeNull();
  });
});

describe('loadCorporationDivisions', () => {
  it('caches the division names under a corp-scoped key', async () => {
    const payload = { wallet: [{ division: 1, name: 'Master Wallet' }] };
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}/divisions`, () =>
        HttpResponse.json(payload)
      )
    );

    const result = await loadCorporationDivisions(CHAR_ID, CORP_ID);

    expect(result.cached?.data).toEqual(payload);
    expect(
      (await db.esiCache.get([CHAR_ID, corpCacheKey(CORP_ID, KEYS.divisions)]))?.value
    ).toEqual(payload);
  });
});

describe('loadCorporationWalletJournal', () => {
  it('caches each division under its own key', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}/wallets/1/journal`, () =>
        HttpResponse.json([entry(1)])
      ),
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}/wallets/2/journal`, () =>
        HttpResponse.json([entry(2)])
      )
    );

    await loadCorporationWalletJournal(CHAR_ID, CORP_ID, 1);
    await loadCorporationWalletJournal(CHAR_ID, CORP_ID, 2);

    expect(
      (await db.esiCache.get([CHAR_ID, corpCacheKey(CORP_ID, KEYS.journal(1))]))?.value
    ).toEqual([entry(1)]);
    expect(
      (await db.esiCache.get([CHAR_ID, corpCacheKey(CORP_ID, KEYS.journal(2))]))?.value
    ).toEqual([entry(2)]);
  });

  /** The division is part of the key, so an offline read of a division never seen misses. */
  it('never serves one division journal under another', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, KEYS.journal(1)),
      value: [entry(1)],
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}/wallets/2/journal`, () =>
        HttpResponse.error()
      )
    );

    const result = await loadCorporationWalletJournal(CHAR_ID, CORP_ID, 2);

    expect(result.cached).toBeNull();
  });
});
