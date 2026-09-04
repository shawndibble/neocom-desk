import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { db } from '@/db';
import { configureEsi } from '@/esi/client';
import { writeCached } from '@/esi/cache';
import { loadPiRosterSnapshot } from './roster';

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
}));

const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';
const ACTIVE_ID = 90;

/**
 * No handlers at all, with `onUnhandledRequest: 'error'`: any ESI call this
 * module makes fails the test outright. That is the point — the roster's
 * whole contract is that it costs zero live calls on page open, and a test
 * that merely handled a 403 gracefully would pass while the fan-out lived on.
 */
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.characters.clear();
  await db.tokens.clear();
  await db.esiCache.clear();
});

async function addCharacter(characterId: number, name: string, scopes: string[]) {
  await db.characters.put({ characterId, name, ownerHash: `oh${characterId}`, addedAt: 1 });
  await db.tokens.put({
    characterId,
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + 6e5,
    scopes,
  });
}

const FETCHED_AT = Date.parse('2026-09-01T00:00:00Z');
const EXPIRY = '2026-09-10T00:00:00Z';

function planet(planetId: number, solarSystemId = 30000142) {
  return {
    solar_system_id: solarSystemId,
    planet_id: planetId,
    planet_type: 'temperate' as const,
    owner_id: 1,
    last_update: '2026-08-30T00:00:00Z',
    upgrade_level: 3,
    num_pins: 1,
  };
}

function extractorDetail(pinId: number, productTypeId?: number) {
  return {
    links: [],
    routes: [],
    pins: [
      {
        pin_id: pinId,
        type_id: 2848,
        latitude: 0,
        longitude: 0,
        expiry_time: EXPIRY,
        extractor_details: {
          heads: [{ head_id: 1, latitude: 0, longitude: 0 }],
          ...(productTypeId === undefined ? {} : { product_type_id: productTypeId }),
        },
      },
    ],
  };
}

async function cachePlanets(characterId: number, planets: unknown[]) {
  await writeCached(characterId, 'planets', planets, FETCHED_AT);
}

async function cacheDetail(characterId: number, planetId: number, detail: unknown) {
  await writeCached(characterId, `planet:${planetId}`, detail, FETCHED_AT);
}

describe('loadPiRosterSnapshot', () => {
  it('returns nothing when no other Character is authenticated', async () => {
    await addCharacter(ACTIVE_ID, 'Active Pilot', [PLANETS_SCOPE]);
    await expect(loadPiRosterSnapshot(ACTIVE_ID)).resolves.toEqual({
      colonies: [],
      skipped: [],
      notLoaded: [],
      noColonies: [],
    });
  });

  it('excludes the active Character even though it has cached colonies', async () => {
    await addCharacter(ACTIVE_ID, 'Active Pilot', [PLANETS_SCOPE]);
    await addCharacter(91, 'Pilot One', [PLANETS_SCOPE]);
    await cachePlanets(ACTIVE_ID, [planet(40000099)]);
    await cacheDetail(ACTIVE_ID, 40000099, extractorDetail(99));
    await cachePlanets(91, [planet(40000001)]);
    await cacheDetail(91, 40000001, extractorDetail(1));

    const snapshot = await loadPiRosterSnapshot(ACTIVE_ID);

    expect(snapshot.colonies).toHaveLength(1);
    expect(snapshot.colonies[0].characterId).toBe(91);
  });

  it('gathers colonies from every other scoped Character into one list', async () => {
    await addCharacter(ACTIVE_ID, 'Active Pilot', [PLANETS_SCOPE]);
    await addCharacter(91, 'Pilot One', [PLANETS_SCOPE]);
    await addCharacter(92, 'Pilot Two', [PLANETS_SCOPE]);
    await cachePlanets(91, [planet(40000001)]);
    await cachePlanets(92, [planet(40000002)]);
    await cacheDetail(91, 40000001, extractorDetail(1));
    await cacheDetail(92, 40000002, extractorDetail(2));

    const snapshot = await loadPiRosterSnapshot(ACTIVE_ID);

    expect(snapshot.colonies).toHaveLength(2);
    expect(snapshot.colonies.map((entry) => entry.characterName).sort()).toEqual([
      'Pilot One',
      'Pilot Two',
    ]);
    expect(snapshot.colonies[0].detail?.pins[0].expiry_time).toBe(EXPIRY);
  });

  it('skips a Character without the planets scope, and makes no ESI call for it', async () => {
    await addCharacter(ACTIVE_ID, 'Active Pilot', [PLANETS_SCOPE]);
    await addCharacter(91, 'Pilot One', [PLANETS_SCOPE]);
    await addCharacter(93, 'Scopeless Alt', ['esi-skills.read_skills.v1']);
    await cachePlanets(91, [planet(40000001)]);
    await cacheDetail(91, 40000001, extractorDetail(1));

    const snapshot = await loadPiRosterSnapshot(ACTIVE_ID);

    // The msw server has no handlers and errors on any request, so reaching
    // here at all proves the scopeless Character was never fetched.
    expect(snapshot.skipped).toEqual([{ characterId: 93, name: 'Scopeless Alt' }]);
    expect(snapshot.notLoaded).toEqual([]);
    expect(snapshot.colonies).toHaveLength(1);
  });

  it('separates "nothing cached yet" from "no colonies"', async () => {
    await addCharacter(ACTIVE_ID, 'Active Pilot', [PLANETS_SCOPE]);
    await addCharacter(91, 'Never Read', [PLANETS_SCOPE]);
    await addCharacter(92, 'Genuinely Empty', [PLANETS_SCOPE]);
    await cachePlanets(92, []);

    const snapshot = await loadPiRosterSnapshot(ACTIVE_ID);

    expect(snapshot.notLoaded).toEqual([{ characterId: 91, name: 'Never Read' }]);
    expect(snapshot.noColonies).toEqual([{ characterId: 92, name: 'Genuinely Empty' }]);
  });

  it('lists a colony whose detail is not cached rather than dropping it silently', async () => {
    await addCharacter(ACTIVE_ID, 'Active Pilot', [PLANETS_SCOPE]);
    await addCharacter(91, 'Pilot One', [PLANETS_SCOPE]);
    await cachePlanets(91, [planet(40000001), planet(40000002)]);
    await cacheDetail(91, 40000001, extractorDetail(1));

    const snapshot = await loadPiRosterSnapshot(ACTIVE_ID);

    expect(snapshot.colonies).toHaveLength(2);
    const undetailed = snapshot.colonies.find((c) => c.planet.planet_id === 40000002);
    expect(undetailed?.detail).toBeNull();
  });
});
