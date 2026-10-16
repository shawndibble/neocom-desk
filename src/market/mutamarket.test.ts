import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { ensureAnySession } from '@/sync/syncAuth';
import { GLOBAL_CACHE_CHARACTER_ID } from '@/esi/cache';
import {
  ABYSSAL_ESTIMATE_TTL_MS,
  ABYSSAL_NO_ESTIMATE_TTL_MS,
  ABYSSAL_NOT_IMPORTED_TTL_MS,
  ABYSSAL_UNAVAILABLE_RETRY_MS,
  MUTAMARKET_SITE_URL,
  abyssalEstimateCacheKey,
  clearAbyssalEstimateMemory,
  configureMutamarket,
  getAbyssalEstimate,
  toStoredEstimate,
  type MutamarketEstimateResponse,
  type MutamarketTransport,
} from './mutamarket';

const callable = vi.hoisted(() => vi.fn());
vi.mock('firebase/functions', () => ({
  httpsCallable: (_fns: unknown, name: string, options: unknown) => (data: unknown) =>
    callable(name, data, options),
}));
vi.mock('@/sync/firebaseApp', () => ({ getSyncFunctions: () => ({}) }));
vi.mock('@/sync/syncAuth', () => ({ ensureAnySession: vi.fn(async () => 'char:7') }));
vi.mock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));

const CHARACTER = 7;
const OPTS = { characterId: CHARACTER };
const IMPORT = { characterId: CHARACTER, importIfMissing: true };

const BCS = 49738;
const ITEM = 1056087009644;
const PAGE = `${MUTAMARKET_SITE_URL}/modules/abyssal-ballistic-control-system-${ITEM}`;

const PRICED: MutamarketEstimateResponse = {
  status: 'priced',
  value: 282840604.66,
  valueUpdatedAt: '2026-10-16 06:20:34.839067+00',
  url: PAGE,
};

let clock = 1_000_000;

function setup(answer: MutamarketTransport) {
  const transport = vi.fn(answer);
  configureMutamarket({ transport, clock: () => clock });
  return transport;
}

/** Lets the fire-and-forget Dexie write land. */
async function flushWrites() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  clock = 1_000_000;
  clearAbyssalEstimateMemory();
  await db.esiCache.clear();
});

afterEach(() => {
  configureMutamarket(null);
});

describe('getAbyssalEstimate', () => {
  it('returns a priced estimate with its source and link', async () => {
    const transport = setup(async () => PRICED);
    await expect(getAbyssalEstimate(BCS, ITEM, OPTS)).resolves.toEqual({
      status: 'priced',
      value: 282840604.66,
      valueUpdatedAt: '2026-10-16 06:20:34.839067+00',
      url: PAGE,
      source: 'mutamarket',
      fetchedAt: 1_000_000,
    });
    expect(transport).toHaveBeenCalledWith({
      characterId: CHARACTER,
      typeId: BCS,
      itemId: ITEM,
      importIfMissing: false,
    });
  });

  it('caches per item until the TTL lapses', async () => {
    const transport = setup(async () => PRICED);
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(transport).toHaveBeenCalledTimes(1);
    clock += ABYSSAL_ESTIMATE_TTL_MS + 1;
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('answers a reload from the persisted cache', async () => {
    const transport = setup(async () => PRICED);
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    await flushWrites();
    const row = await db.esiCache.get([GLOBAL_CACHE_CHARACTER_ID, abyssalEstimateCacheKey(ITEM)]);
    expect(row?.value).toMatchObject({ status: 'priced', value: 282840604.66 });

    clearAbyssalEstimateMemory();
    clock += 1000;
    const again = await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(again).toMatchObject({ status: 'priced', fetchedAt: 1_000_000 });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('holds "no estimate" for its own longer TTL', async () => {
    const transport = setup(async () => ({ status: 'no-estimate', url: null }));
    const first = await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(first).toMatchObject({ status: 'no-estimate', value: null, url: MUTAMARKET_SITE_URL });
    clock += ABYSSAL_ESTIMATE_TTL_MS + 1;
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(transport).toHaveBeenCalledTimes(1);
    clock += ABYSSAL_NO_ESTIMATE_TTL_MS;
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('turns a failure into "unavailable", never 0, and does not persist it', async () => {
    const transport = setup(async () => {
      throw new Error('functions/not-found');
    });
    const result = await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(result).toMatchObject({ status: 'unavailable', value: null });
    await flushWrites();
    expect(await db.esiCache.count()).toBe(0);

    await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(transport).toHaveBeenCalledTimes(1);
    clock += ABYSSAL_UNAVAILABLE_RETRY_MS + 1;
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('runs lookups one at a time and shares one per item', async () => {
    let active = 0;
    let peak = 0;
    const transport = setup(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return PRICED;
    });
    await Promise.all([
      getAbyssalEstimate(BCS, 1, OPTS),
      getAbyssalEstimate(BCS, 2, OPTS),
      getAbyssalEstimate(BCS, 2, OPTS),
      getAbyssalEstimate(BCS, 3, OPTS),
    ]);
    expect(peak).toBe(1);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('imports only on an explicit ask, past a cached not-imported', async () => {
    const transport = setup(async ({ importIfMissing }) =>
      importIfMissing ? PRICED : { status: 'not-imported' }
    );
    expect(await getAbyssalEstimate(BCS, ITEM, OPTS)).toMatchObject({
      status: 'not-imported',
      value: null,
    });
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(transport).toHaveBeenCalledTimes(1);

    await flushWrites();
    clearAbyssalEstimateMemory();
    expect((await getAbyssalEstimate(BCS, ITEM, OPTS)).status).toBe('not-imported');
    expect(transport).toHaveBeenCalledTimes(1);

    expect((await getAbyssalEstimate(BCS, ITEM, IMPORT)).status).toBe('priced');
    expect(transport).toHaveBeenLastCalledWith(expect.objectContaining({ importIfMissing: true }));
  });

  it('asks again for a not-imported module after its TTL', async () => {
    const transport = setup(async () => ({ status: 'not-imported' }));
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    clock += ABYSSAL_NOT_IMPORTED_TTL_MS + 1;
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('makes no call for ids that are not positive integers', async () => {
    const transport = setup(async () => PRICED);
    const result = await getAbyssalEstimate(BCS, Number.NaN, OPTS);
    expect(result).toMatchObject({ status: 'unknown', value: null });
    expect(transport).not.toHaveBeenCalled();
  });
});

describe('toStoredEstimate', () => {
  it.each([0, -1, Number.POSITIVE_INFINITY])('reads a priced value of %s as no estimate', (v) => {
    expect(toStoredEstimate({ status: 'priced', value: v, url: PAGE })).toMatchObject({
      status: 'no-estimate',
      value: null,
    });
  });

  it('keeps only MutaMarket links', () => {
    expect(toStoredEstimate({ ...PRICED, url: 'https://evil.example/x' }).url).toBe(
      MUTAMARKET_SITE_URL
    );
  });

  it('reads anything unrecognised as unknown', () => {
    expect(toStoredEstimate(null)).toMatchObject({ status: 'unknown', value: null });
    expect(toStoredEstimate({ status: 'weird' })).toMatchObject({ status: 'unknown' });
  });
});

describe('the callable transport', () => {
  it('signs in as the Character, then sends only the ids and the import flag', async () => {
    callable.mockResolvedValue({ data: PRICED });
    const result = await getAbyssalEstimate(BCS, ITEM, IMPORT);
    expect(result.status).toBe('priced');
    expect(ensureAnySession).toHaveBeenCalledWith(CHARACTER);
    expect(callable).toHaveBeenCalledWith(
      'mutamarketEstimate',
      { typeId: BCS, itemId: ITEM, importIfMissing: true },
      { timeout: 120_000 }
    );
  });
});
