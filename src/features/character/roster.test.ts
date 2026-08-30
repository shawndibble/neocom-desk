import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { clearCachePurgePending, purgeCharacterCacheOrSuppress } from '@/esi/cachePurge';
import { loadWalletBalance } from './wallet';
import { loadCharacterSkills, loadCharacterSkillQueue } from '@/features/skills/data';
import { loadRosterSnapshot } from './roster';

vi.mock('./wallet', () => ({
  loadWalletBalance: vi.fn(),
  KEYS: {
    balance: 'wallet:balance',
    journal: 'wallet:journal',
    transactions: 'wallet:transactions',
  },
}));
vi.mock('@/features/skills/data', () => ({
  loadCharacterSkills: vi.fn(),
  loadCharacterSkillQueue: vi.fn(),
  KEYS: {
    skills: 'skills',
    attributes: 'attributes',
    implants: 'implants',
    skillqueue: 'skillqueue',
  },
}));

const CHAR_A = 91;
const CHAR_B = 92;
const CHAR_C = 93;

function seedCharacter(characterId: number, name: string): Promise<unknown> {
  return db.characters.put({ characterId, name, ownerHash: 'oh', addedAt: 0 });
}

function seedCache(
  characterId: number,
  key: string,
  value: unknown,
  fetchedAt = 1
): Promise<unknown> {
  return db.esiCache.put({ characterId, key, value, fetchedAt });
}

beforeEach(async () => {
  await db.characters.clear();
  await db.esiCache.clear();
  vi.mocked(loadWalletBalance).mockReset();
  vi.mocked(loadCharacterSkills).mockReset();
  vi.mocked(loadCharacterSkillQueue).mockReset();
});

afterEach(async () => {
  await clearCachePurgePending(CHAR_A);
  await clearCachePurgePending(CHAR_B);
  await clearCachePurgePending(CHAR_C);
});

describe('loadRosterSnapshot (cache-only, default)', () => {
  it('returns [] for an empty roster', async () => {
    await expect(loadRosterSnapshot()).resolves.toEqual([]);
  });

  it('reads cached wallet/skills/queue rows via bulkGet on the exact compound key tuples', async () => {
    const bulkGetSpy = vi.spyOn(db.esiCache, 'bulkGet');
    await seedCharacter(CHAR_A, 'Pilot A');
    await seedCharacter(CHAR_B, 'Pilot B');
    await seedCache(CHAR_A, 'wallet:balance', 1000);
    await seedCache(CHAR_A, 'skills', { skills: [], total_sp: 500 });
    await seedCache(CHAR_A, 'skillqueue', [{ skill_id: 1, queue_position: 0, finished_level: 3 }]);
    await seedCache(CHAR_B, 'wallet:balance', 2000);

    const roster = await loadRosterSnapshot();

    expect(bulkGetSpy.mock.calls).toEqual([
      [
        [
          [CHAR_A, 'wallet:balance'],
          [CHAR_B, 'wallet:balance'],
        ],
      ],
      [
        [
          [CHAR_A, 'skills'],
          [CHAR_B, 'skills'],
        ],
      ],
      [
        [
          [CHAR_A, 'skillqueue'],
          [CHAR_B, 'skillqueue'],
        ],
      ],
    ]);

    const a = roster.find((r) => r.characterId === CHAR_A);
    expect(a?.wallet).toEqual({
      data: 1000,
      fetchedAt: new Date(1),
      fromCache: true,
      truncated: false,
    });
    expect(a?.skills?.data).toEqual({ skills: [], total_sp: 500 });
    expect(a?.queue?.data).toEqual([{ skill_id: 1, queue_position: 0, finished_level: 3 }]);

    const b = roster.find((r) => r.characterId === CHAR_B);
    expect(b?.wallet?.data).toBe(2000);
    // B has no cached skills/queue row: null, not a fabricated empty value.
    expect(b?.skills).toBeNull();
    expect(b?.queue).toBeNull();

    bulkGetSpy.mockRestore();
  });

  it('yields null (not an empty value) for a character with no cached row at all', async () => {
    await seedCharacter(CHAR_C, 'Pilot C');

    const [entry] = await loadRosterSnapshot();

    expect(entry).toEqual({
      characterId: CHAR_C,
      name: 'Pilot C',
      wallet: null,
      skills: null,
      queue: null,
    });
  });

  it('makes zero ESI calls (no per-character loader is ever invoked)', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    await seedCache(CHAR_A, 'wallet:balance', 1000);

    await loadRosterSnapshot();

    expect(loadWalletBalance).not.toHaveBeenCalled();
    expect(loadCharacterSkills).not.toHaveBeenCalled();
    expect(loadCharacterSkillQueue).not.toHaveBeenCalled();
  });

  it('never serves a row for a character whose cache purge is still pending (privacy gate parity with cache.ts readCachedRow)', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    await seedCache(CHAR_A, 'wallet:balance', 999999);

    // Force tier-3 "suppressed": both the targeted and full purge fail, so the
    // row survives on disk but must never be read again (mirrors
    // esi/cachePurge.test.ts's own tier-3 test).
    const where = vi.spyOn(db.esiCache, 'where').mockImplementation(() => {
      throw new Error('index damaged');
    });
    const clear = vi.spyOn(db.esiCache, 'clear').mockRejectedValue(new Error('QuotaExceeded'));
    await expect(purgeCharacterCacheOrSuppress(CHAR_A)).resolves.toBe('suppressed');
    where.mockRestore();
    clear.mockRestore();

    // The row is still physically present...
    expect((await db.esiCache.get([CHAR_A, 'wallet:balance']))?.value).toBe(999999);

    // ...but roster must not serve it.
    const [entry] = await loadRosterSnapshot();
    expect(entry.wallet).toBeNull();
  });
});

describe('loadRosterSnapshot({ live: true })', () => {
  it('calls the per-character loaders and returns their results', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    vi.mocked(loadWalletBalance).mockResolvedValue({
      data: 42,
      fetchedAt: new Date(1),
      fromCache: false,
      truncated: false,
    });
    vi.mocked(loadCharacterSkills).mockResolvedValue({
      data: { skills: [], total_sp: 10 },
      fetchedAt: new Date(1),
      fromCache: false,
      truncated: false,
    });
    vi.mocked(loadCharacterSkillQueue).mockResolvedValue({
      data: [],
      fetchedAt: new Date(1),
      fromCache: false,
      truncated: false,
    });

    const [entry] = await loadRosterSnapshot({ live: true });

    expect(loadWalletBalance).toHaveBeenCalledWith(CHAR_A);
    expect(loadCharacterSkills).toHaveBeenCalledWith(CHAR_A);
    expect(loadCharacterSkillQueue).toHaveBeenCalledWith(CHAR_A);
    expect(entry.wallet?.data).toBe(42);
    expect(entry.skills?.data.total_sp).toBe(10);
    expect(entry.queue?.data).toEqual([]);
  });

  it('never exceeds the concurrency cap of 10 characters in flight', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => 1000 + i);
    await Promise.all(ids.map((id) => seedCharacter(id, `Pilot ${id}`)));

    let inFlight = 0;
    let maxInFlight = 0;
    const pending: Array<() => void> = [];
    const deferred = () =>
      new Promise<{ data: number; fetchedAt: Date; fromCache: boolean; truncated: boolean }>(
        (resolve) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          pending.push(() => {
            inFlight -= 1;
            resolve({ data: 0, fetchedAt: new Date(1), fromCache: false, truncated: false });
          });
        }
      );
    vi.mocked(loadWalletBalance).mockImplementation(deferred);
    vi.mocked(loadCharacterSkills).mockResolvedValue({
      data: { skills: [], total_sp: 0 },
      fetchedAt: new Date(1),
      fromCache: false,
      truncated: false,
    });
    vi.mocked(loadCharacterSkillQueue).mockResolvedValue({
      data: [],
      fetchedAt: new Date(1),
      fromCache: false,
      truncated: false,
    });

    const rosterPromise = loadRosterSnapshot({ live: true });

    let released = 0;
    for (let guard = 0; guard < 200 && released < ids.length; guard += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const wave = pending.splice(0, pending.length);
      released += wave.length;
      wave.forEach((resolve) => resolve());
    }

    await rosterPromise;

    expect(released).toBe(ids.length);
    expect(maxInFlight).toBeLessThanOrEqual(10);
    expect(maxInFlight).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Cache key parity, end to end: roster.ts imports CACHE_KEYS from
// wallet.ts's/skills/data.ts's exported `KEYS` maps rather than redeclaring
// them, but this still runs the REAL (unmocked) per-character loaders against
// MSW to populate `db.esiCache` under their actual key strings, then asserts
// cache-only `loadRosterSnapshot()` — which never touches the mocked loaders
// used elsewhere in this file — reads the same rows back. Regression pin: if
// this stops passing, roster.ts and the loaders it wraps have gone out of
// sync on cache keys.
// ---------------------------------------------------------------------------
describe('loadRosterSnapshot (cache-only) — cache key parity with the real loaders', () => {
  const server = setupServer();

  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  beforeEach(() => configureEsi({ getToken: vi.fn(async () => 'tok') }));
  afterEach(() => {
    server.resetHandlers();
    configureEsi({ getToken: null });
  });
  afterAll(() => server.close());

  it('reads back real loadWalletBalance/loadCharacterSkills/loadCharacterSkillQueue cache rows', async () => {
    const real = await vi.importActual<typeof import('./wallet')>('./wallet');
    const realSkills =
      await vi.importActual<typeof import('@/features/skills/data')>('@/features/skills/data');
    await seedCharacter(CHAR_A, 'Pilot A');

    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/wallet`, () => HttpResponse.json(555.5)),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/skills`, () =>
        HttpResponse.json({ skills: [], total_sp: 777 })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/skillqueue`, () => HttpResponse.json([]))
    );

    await real.loadWalletBalance(CHAR_A);
    await realSkills.loadCharacterSkills(CHAR_A);
    await realSkills.loadCharacterSkillQueue(CHAR_A);

    const [entry] = await loadRosterSnapshot();

    expect(entry.wallet?.data).toBe(555.5);
    expect(entry.skills?.data).toEqual({ skills: [], total_sp: 777 });
    expect(entry.queue?.data).toEqual([]);
  });
});

describe('loadRosterSnapshot({ live: true }) — failure isolation', () => {
  it("one character's loader failure does not sink the whole snapshot", async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    await seedCharacter(CHAR_B, 'Pilot B');
    vi.mocked(loadWalletBalance).mockImplementation(async (characterId: number) => {
      if (characterId === CHAR_A) throw new Error('ESI 500');
      return { data: 2000, fetchedAt: new Date(1), fromCache: false, truncated: false };
    });
    vi.mocked(loadCharacterSkills).mockResolvedValue({
      data: { skills: [], total_sp: 0 },
      fetchedAt: new Date(1),
      fromCache: false,
      truncated: false,
    });
    vi.mocked(loadCharacterSkillQueue).mockResolvedValue({
      data: [],
      fetchedAt: new Date(1),
      fromCache: false,
      truncated: false,
    });

    const roster = await loadRosterSnapshot({ live: true });

    const a = roster.find((r) => r.characterId === CHAR_A);
    const b = roster.find((r) => r.characterId === CHAR_B);
    expect(a?.wallet).toBeNull();
    expect(a?.skills?.data).toEqual({ skills: [], total_sp: 0 });
    expect(b?.wallet?.data).toBe(2000);
  });
});
