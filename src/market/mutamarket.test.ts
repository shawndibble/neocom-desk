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
  onAbyssalEstimate,
  readCachedAbyssalEstimates,
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

  it('runs imports one at a time and shares one ask per item', async () => {
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
      getAbyssalEstimate(BCS, 1, IMPORT),
      getAbyssalEstimate(BCS, 2, IMPORT),
      getAbyssalEstimate(BCS, 2, IMPORT),
      getAbyssalEstimate(BCS, 3, IMPORT),
    ]);
    expect(peak).toBe(1);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it('does not make lookups wait behind an import', async () => {
    let releaseImport: () => void = () => {};
    const importGate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    setup(async ({ importIfMissing }) => {
      if (importIfMissing) await importGate;
      return PRICED;
    });
    const importing = getAbyssalEstimate(BCS, 1, IMPORT);
    expect((await getAbyssalEstimate(BCS, 2, OPTS)).status).toBe('priced');
    releaseImport();
    expect((await importing).status).toBe('priced');
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

  it('lets an import click retry past a cached failure', async () => {
    let fail = true;
    const transport = setup(async () => {
      if (fail) throw new Error('unavailable');
      return PRICED;
    });
    expect((await getAbyssalEstimate(BCS, ITEM, OPTS)).status).toBe('unavailable');
    fail = false;
    expect((await getAbyssalEstimate(BCS, ITEM, OPTS)).status).toBe('unavailable');
    expect((await getAbyssalEstimate(BCS, ITEM, IMPORT)).status).toBe('priced');
    expect(transport).toHaveBeenCalledTimes(2);
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

describe('onAbyssalEstimate', () => {
  it('tells listeners of every answer, an import included, until they unsubscribe', async () => {
    setup(async (request) => (request.importIfMissing ? PRICED : { status: 'not-imported' }));
    const heard: [number, string][] = [];
    const stop = onAbyssalEstimate((itemId, estimate) => heard.push([itemId, estimate.status]));
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    await getAbyssalEstimate(BCS, ITEM, IMPORT);
    stop();
    await getAbyssalEstimate(BCS, ITEM + 1, OPTS);
    expect(heard).toEqual([
      [ITEM, 'not-imported'],
      [ITEM, 'priced'],
    ]);
  });
});

describe('readCachedAbyssalEstimates', () => {
  const OTHER = 1056087009645;

  it('answers from memory and the persisted cache without calling MutaMarket', async () => {
    setup(async () => PRICED);
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    await flushWrites();
    const transport = setup(async () => PRICED);
    const fromMemory = await readCachedAbyssalEstimates([ITEM, OTHER]);
    expect(fromMemory.get(ITEM)?.value).toBe(282840604.66);
    expect(fromMemory.has(OTHER)).toBe(false);
    clearAbyssalEstimateMemory();
    const fromDisk = await readCachedAbyssalEstimates([ITEM, OTHER]);
    expect(fromDisk.get(ITEM)).toMatchObject({ status: 'priced', fetchedAt: 1_000_000 });
    expect(transport).not.toHaveBeenCalled();
  });

  it('skips an expired answer unless asked for the last known one', async () => {
    setup(async () => PRICED);
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    await flushWrites();
    clock += ABYSSAL_ESTIMATE_TTL_MS + 1;
    expect((await readCachedAbyssalEstimates([ITEM])).has(ITEM)).toBe(false);
    clearAbyssalEstimateMemory();
    expect((await readCachedAbyssalEstimates([ITEM])).has(ITEM)).toBe(false);
    const lastKnown = await readCachedAbyssalEstimates([ITEM], { includeExpired: true });
    expect(lastKnown.get(ITEM)?.value).toBe(282840604.66);
  });

  it('never returns an unavailable answer as a cached one', async () => {
    setup(async () => {
      throw new Error('down');
    });
    await getAbyssalEstimate(BCS, ITEM, OPTS);
    expect((await readCachedAbyssalEstimates([ITEM])).has(ITEM)).toBe(false);
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
