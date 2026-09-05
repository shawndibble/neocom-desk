import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { corpCacheKey } from '@/esi/cache';
import { db } from '@/db';
import {
  KEYS,
  loadCorporationMemberIds,
  loadCorporationMemberTracking,
  loadMemberLabels,
  toMemberActivity,
} from './members';

/**
 * `loadTypeNames` reads the SDE snapshot off disk before it touches ESI and has
 * its own tests for that. Stubbing it keeps these cases about the *roster's*
 * call budget, which is what AC3 is a claim about.
 */
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(
    async (ids: readonly number[]) => new Map(ids.map((id) => [id, `Type ${id}`]))
  ),
}));

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

const TRACKING = [
  {
    character_id: 1001,
    logon_date: '2026-09-01T10:00:00Z',
    logoff_date: '2026-09-01T12:00:00Z',
    start_date: '2024-01-01T00:00:00Z',
    ship_type_id: 587,
    location_id: 60003760,
  },
];

describe('loadCorporationMemberIds', () => {
  it('caches the roster under a corp-scoped key', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}/members`, () =>
        HttpResponse.json([1001, 1002])
      )
    );

    const result = await loadCorporationMemberIds(CHAR_ID, CORP_ID);

    expect(result.cached?.data).toEqual([1001, 1002]);
    expect((await db.esiCache.get([CHAR_ID, corpCacheKey(CORP_ID, KEYS.members)]))?.value).toEqual([
      1001, 1002,
    ]);
  });
});

describe('loadCorporationMemberTracking', () => {
  it('caches the tracking rows under a corp-scoped key', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}/membertracking`, () =>
        HttpResponse.json(TRACKING)
      )
    );

    const result = await loadCorporationMemberTracking(CHAR_ID, CORP_ID);

    expect(result.cached?.data).toEqual(TRACKING);
    expect((await db.esiCache.get([CHAR_ID, corpCacheKey(CORP_ID, KEYS.tracking)]))?.value).toEqual(
      TRACKING
    );
  });

  /**
   * A Character who lost the Director role, or never had it. Re-authing cannot
   * grant an in-game role, so this must not raise the app-wide notice.
   */
  it('treats a 403 as the in-game role gate, not a re-login prompt', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}/membertracking`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );

    const result = await loadCorporationMemberTracking(CHAR_ID, CORP_ID);

    expect(result.needsReauth).toBe(false);
  });
});

describe('toMemberActivity', () => {
  it('turns ESI ISO strings into the epoch milliseconds the engine takes', () => {
    expect(toMemberActivity(TRACKING)).toEqual([
      {
        characterId: 1001,
        logonMs: Date.parse('2026-09-01T10:00:00Z'),
        logoffMs: Date.parse('2026-09-01T12:00:00Z'),
        startMs: Date.parse('2024-01-01T00:00:00Z'),
        shipTypeId: 587,
        locationId: 60003760,
      },
    ]);
  });

  it('reads an omitted field as null, never as zero', () => {
    expect(toMemberActivity([{ character_id: 7 }])).toEqual([
      {
        characterId: 7,
        logonMs: null,
        logoffMs: null,
        startMs: null,
        shipTypeId: null,
        locationId: null,
      },
    ]);
  });
});

describe('loadMemberLabels (AC3)', () => {
  /** Two hundred members, one station, one ship: the shape of a real corp. */
  function roster(size: number) {
    return Array.from({ length: size }, (_, i) => ({
      characterId: 1000 + i,
      logonMs: null,
      logoffMs: null,
      startMs: null,
      shipTypeId: 587,
      locationId: 60003760,
    }));
  }

  it('resolves a 200-member roster in one names call, not two hundred', async () => {
    // Every request body, not just the last: `loadMemberLabels` fans its
    // three lookups out with `Promise.all`, so which one lands last is not
    // something this test gets to assert.
    const batches: number[][] = [];
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        const ids = (await request.json()) as number[];
        batches.push(ids);
        return HttpResponse.json(
          ids.map((id) => ({ id, name: `Name ${id}`, category: 'character' }))
        );
      })
    );

    const labels = await loadMemberLabels(CHAR_ID, roster(200));

    // One batch for the 200 characters, one for the single distinct location.
    expect(batches).toHaveLength(2);
    expect(batches).toContainEqual([60003760]);
    expect(batches.some((ids) => ids.length === 200)).toBe(true);
    expect(labels.characters.size).toBe(200);
    expect(labels.ships.get(587)).toBe('Type 587');
    expect(labels.locations.get(60003760)).toBe('Name 60003760');
  });

  /**
   * An Upwell structure has no bulk name endpoint and would 404 the whole
   * `/universe/names` batch if it were mixed in, so it is split out by id range
   * and asked for on its own — once per distinct structure, not per member.
   */
  it('resolves an Upwell structure separately from the bulk batch', async () => {
    const STRUCTURE_ID = 1035466617946;
    let structureCalls = 0;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        const ids = (await request.json()) as number[];
        expect(ids).not.toContain(STRUCTURE_ID);
        return HttpResponse.json(
          ids.map((id) => ({ id, name: `Name ${id}`, category: 'character' }))
        );
      }),
      http.get(`${ESI_BASE_URL}/universe/structures/${STRUCTURE_ID}`, () => {
        structureCalls += 1;
        return HttpResponse.json({ name: 'X-7OMU - Home', owner_id: 1, solar_system_id: 30000001 });
      })
    );

    const members = roster(30).map((member) => ({ ...member, locationId: STRUCTURE_ID }));
    const labels = await loadMemberLabels(CHAR_ID, members);

    expect(structureCalls).toBe(1);
    expect(labels.locations.get(STRUCTURE_ID)).toBe('X-7OMU - Home');
  });

  it('asks for the names of members who are no longer on the roster', async () => {
    let batched: number[] = [];
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        batched = (await request.json()) as number[];
        return HttpResponse.json(
          batched.map((id) => ({ id, name: `Name ${id}`, category: 'character' }))
        );
      })
    );

    const labels = await loadMemberLabels(CHAR_ID, [], [4004]);

    expect(batched).toEqual([4004]);
    expect(labels.characters.get(4004)).toBe('Name 4004');
  });
});
