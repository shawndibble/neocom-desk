import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import {
  loadWalletBalance,
  loadWalletBalanceWithStatus,
  loadWalletJournal,
  loadWalletJournalWithStatus,
  loadWalletTransactions,
  loadAllCharactersWalletBalances,
  totalWalletBalance,
  type CharacterWalletBalance,
} from './wallet';

const CHAR_ID = 91;
const WALLET_SCOPE = 'esi-wallet.read_character_wallet.v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.characters.clear();
  await db.tokens.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

function tokenWith(characterId: number, scopes: string[]) {
  return {
    characterId,
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + 6e5,
    scopes,
  };
}

describe('loadWalletBalance', () => {
  it('fetches from ESI and caches it', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet`, () => HttpResponse.json(1234.5))
    );
    const result = await loadWalletBalance(CHAR_ID);
    expect(result).toEqual({
      data: 1234.5,
      fetchedAt: expect.any(Date),
      fromCache: false,
      truncated: false,
    });
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
    expect(result).toEqual({
      data: 500,
      fetchedAt: new Date(1),
      fromCache: true,
      truncated: false,
    });
  });

  it('still falls back to cache on a 401 (regression pin: plain loadWithCache callers must not lose their cache just because loadWithCacheStatus exists)', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:balance',
      value: 500,
      fetchedAt: 1,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    const result = await loadWalletBalance(CHAR_ID);

    expect(result).toEqual({
      data: 500,
      fetchedAt: new Date(1),
      fromCache: true,
      truncated: false,
    });
  });
});

describe('loadWalletBalanceWithStatus (BUG #3)', () => {
  it('reports needsReauth: true on a 401, without discarding cached data (regression: needsReauth must not shadow the cache read)', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:balance',
      value: 500,
      fetchedAt: 1,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    const result = await loadWalletBalanceWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toEqual({
      data: 500,
      fetchedAt: new Date(1),
      fromCache: true,
      truncated: false,
    });
  });

  it('reports needsReauth: true and null cached when nothing was ever cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    const result = await loadWalletBalanceWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });

  it('still falls back to cache (needsReauth: false) for a non-auth failure', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:balance',
      value: 500,
      fetchedAt: 1,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet`, () => HttpResponse.error())
    );

    const result = await loadWalletBalanceWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached).toEqual({
      data: 500,
      fetchedAt: new Date(1),
      fromCache: true,
      truncated: false,
    });
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

describe('loadWalletJournalWithStatus', () => {
  it('reports needsReauth: true on a 403, without discarding cached data', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'wallet:journal',
      value: [{ id: 1, date: '2026-08-01T00:00:00Z', ref_type: 'bounty', description: 'a' }],
      fetchedAt: 1,
      truncated: false,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet/journal`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    const result = await loadWalletJournalWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached?.data).toEqual([
      { id: 1, date: '2026-08-01T00:00:00Z', ref_type: 'bounty', description: 'a' },
    ]);
  });

  it('reports needsReauth: true and null cached when nothing was ever cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet/journal`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    const result = await loadWalletJournalWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });

  it('concatenates every page on success', async () => {
    const page1 = [{ id: 1, date: '2026-08-01T00:00:00Z', ref_type: 'bounty', description: 'a' }];
    const page2 = [{ id: 2, date: '2026-08-02T00:00:00Z', ref_type: 'bounty', description: 'b' }];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/wallet/journal`, ({ request }) => {
        const page = new URL(request.url).searchParams.get('page');
        return HttpResponse.json(page === '2' ? page2 : page1, { headers: { 'X-Pages': '2' } });
      })
    );

    const result = await loadWalletJournalWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual([...page1, ...page2]);
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

const CHAR_A = 1;
const CHAR_B = 2;
const CHAR_C = 3;

describe('loadAllCharactersWalletBalances', () => {
  beforeEach(async () => {
    await db.characters.bulkPut([
      { characterId: CHAR_A, name: 'Alice', ownerHash: 'oh1', addedAt: 1 },
      { characterId: CHAR_B, name: 'Bob', ownerHash: 'oh2', addedAt: 2 },
      { characterId: CHAR_C, name: 'Carol', ownerHash: 'oh3', addedAt: 3 },
    ]);
  });

  it('skips a Character without the wallet scope, never calling ESI for it', async () => {
    await db.tokens.bulkPut([tokenWith(CHAR_A, [WALLET_SCOPE]), tokenWith(CHAR_B, [WALLET_SCOPE])]);
    // CHAR_C has no token at all: never granted anything.
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/wallet`, () => HttpResponse.json(100)),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/wallet`, () => HttpResponse.json(200)),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_C}/wallet`, () => {
        throw new Error('must not fetch a Character without the wallet scope');
      })
    );

    const { entries, skipped } = await loadAllCharactersWalletBalances();

    expect(entries.map((e) => e.characterId)).toEqual([CHAR_A, CHAR_B]);
    expect(skipped).toEqual([{ characterId: CHAR_C, name: 'Carol' }]);
  });

  it('surfaces needsReauth on one Character entry without failing the others', async () => {
    await db.tokens.bulkPut([
      tokenWith(CHAR_A, [WALLET_SCOPE]),
      tokenWith(CHAR_B, [WALLET_SCOPE]),
      tokenWith(CHAR_C, [WALLET_SCOPE]),
    ]);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/wallet`, () => HttpResponse.json(100)),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/wallet`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_C}/wallet`, () => HttpResponse.json(300))
    );

    const { entries, skipped } = await loadAllCharactersWalletBalances();

    expect(skipped).toEqual([]);
    expect(entries.map((e) => e.characterId)).toEqual([CHAR_A, CHAR_B, CHAR_C]);

    const bob = entries.find((e) => e.characterId === CHAR_B);
    expect(bob?.needsReauth).toBe(true);
    expect(bob?.balanceResult).toBeNull();

    const alice = entries.find((e) => e.characterId === CHAR_A);
    expect(alice?.needsReauth).toBe(false);
    expect(alice?.balanceResult?.data).toBe(100);
  });

  it('keeps entries in stable, character-list order regardless of which fetch resolves first', async () => {
    await db.tokens.bulkPut([
      tokenWith(CHAR_A, [WALLET_SCOPE]),
      tokenWith(CHAR_B, [WALLET_SCOPE]),
      tokenWith(CHAR_C, [WALLET_SCOPE]),
    ]);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/wallet`, () => HttpResponse.json(100)),
      // CHAR_B is deliberately the slowest response of the three.
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/wallet`, async () => {
        await delay(30);
        return HttpResponse.json(200);
      }),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_C}/wallet`, () => HttpResponse.json(300))
    );

    const { entries } = await loadAllCharactersWalletBalances();

    expect(entries.map((e) => e.characterId)).toEqual([CHAR_A, CHAR_B, CHAR_C]);
  });
});

describe('totalWalletBalance', () => {
  function entry(overrides: Partial<CharacterWalletBalance>): CharacterWalletBalance {
    return {
      characterId: 1,
      characterName: 'Alice',
      balanceResult: { data: 100, fetchedAt: new Date(), fromCache: false, truncated: false },
      needsReauth: false,
      ...overrides,
    };
  }

  it('sums every entry with a usable balance', () => {
    const total = totalWalletBalance([
      entry({
        characterId: 1,
        balanceResult: { data: 100, fetchedAt: new Date(), fromCache: false, truncated: false },
      }),
      entry({
        characterId: 2,
        balanceResult: { data: 250, fetchedAt: new Date(), fromCache: false, truncated: false },
      }),
    ]);
    expect(total).toBe(350);
  });

  it('excludes a needsReauth entry from the total rather than counting it as zero', () => {
    const total = totalWalletBalance([
      entry({
        characterId: 1,
        balanceResult: { data: 100, fetchedAt: new Date(), fromCache: false, truncated: false },
      }),
      entry({ characterId: 2, needsReauth: true, balanceResult: null }),
    ]);
    expect(total).toBe(100);
  });

  it('excludes a never-fetched entry from the total', () => {
    const total = totalWalletBalance([entry({ characterId: 1, balanceResult: null })]);
    expect(total).toBe(0);
  });
});
