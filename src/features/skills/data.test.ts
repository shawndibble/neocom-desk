import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import {
  loadCharacterSkills,
  loadCharacterSkillsWithStatus,
  loadCharacterAttributes,
  loadCharacterImplants,
  loadCharacterSkillQueue,
  loadCharacterSkillQueueWithStatus,
  loadUniverseType,
  loadImplantBonuses,
} from './data';

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

describe('loadCharacterSkills', () => {
  const payload = {
    skills: [
      {
        skill_id: 3300,
        trained_skill_level: 5,
        active_skill_level: 5,
        skillpoints_in_skill: 256000,
      },
    ],
    total_sp: 256000,
    unallocated_sp: 0,
  };

  it('fetches from ESI, writes the cache, and reports fromCache: false', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () => HttpResponse.json(payload))
    );

    const result = await loadCharacterSkills(CHAR_ID);

    expect(result?.fromCache).toBe(false);
    expect(result?.data).toEqual(payload);
    expect(result?.fetchedAt).toBeInstanceOf(Date);
    const cached = await db.esiCache.get([CHAR_ID, 'skills']);
    expect(cached?.value).toEqual(payload);
  });

  it('falls back to the cache when ESI is unreachable', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: 'skills', value: payload, fetchedAt: 1234 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () => HttpResponse.error())
    );

    const result = await loadCharacterSkills(CHAR_ID);

    expect(result?.fromCache).toBe(true);
    expect(result?.data).toEqual(payload);
    expect(result?.fetchedAt).toEqual(new Date(1234));
  });

  it('returns null when ESI fails and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () => HttpResponse.error())
    );
    expect(await loadCharacterSkills(CHAR_ID)).toBeNull();
  });
});

describe('loadCharacterSkillsWithStatus (BUG #3)', () => {
  const payload = {
    skills: [],
    total_sp: 0,
    unallocated_sp: 0,
  };

  it('reports needsReauth: true on a 401, without discarding cached data (regression: needsReauth must not shadow the cache read)', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: 'skills', value: payload, fetchedAt: 1234 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    const result = await loadCharacterSkillsWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached?.data).toEqual(payload);
    expect(result.cached?.fromCache).toBe(true);
  });

  it('reports needsReauth: true on a 403 (missing scope), and null cached when nothing was ever cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    const result = await loadCharacterSkillsWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });

  it('still falls back to cache (needsReauth: false) for a non-auth failure', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: 'skills', value: payload, fetchedAt: 1234 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () => HttpResponse.error())
    );

    const result = await loadCharacterSkillsWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(payload);
    expect(result.cached?.fromCache).toBe(true);
  });

  it('reports live data with needsReauth: false on success', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () => HttpResponse.json(payload))
    );

    const result = await loadCharacterSkillsWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(payload);
    expect(result.cached?.fromCache).toBe(false);
  });
});

describe('loadCharacterAttributes', () => {
  it('fetches attributes and caches them', async () => {
    const attrs = { charisma: 19, intelligence: 20, memory: 20, perception: 20, willpower: 21 };
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/attributes`, () => HttpResponse.json(attrs))
    );
    const result = await loadCharacterAttributes(CHAR_ID);
    expect(result?.data).toEqual(attrs);
    expect(result?.fromCache).toBe(false);
  });
});

describe('loadCharacterImplants', () => {
  it('falls back to cache offline', async () => {
    await db.esiCache.put({ characterId: CHAR_ID, key: 'implants', value: [9899], fetchedAt: 10 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/implants`, () => HttpResponse.error())
    );
    const result = await loadCharacterImplants(CHAR_ID);
    expect(result).toEqual({
      data: [9899],
      fetchedAt: new Date(10),
      fromCache: true,
      truncated: false,
    });
  });
});

describe('loadCharacterSkillQueue', () => {
  it('fetches the skill queue live', async () => {
    const queue = [{ skill_id: 3300, queue_position: 0, finished_level: 5 }];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skillqueue`, () => HttpResponse.json(queue))
    );
    const result = await loadCharacterSkillQueue(CHAR_ID);
    expect(result?.data).toEqual(queue);
    expect(result?.fromCache).toBe(false);
  });

  it('still falls back to cache on a 401 (regression pin: a plain loadWithCache caller must not lose its cache just because loadWithCacheStatus exists)', async () => {
    const queue = [{ skill_id: 3300, queue_position: 0, finished_level: 5 }];
    await db.esiCache.put({ characterId: CHAR_ID, key: 'skillqueue', value: queue, fetchedAt: 1 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json({ error: 'token invalid' }, { status: 401 })
      )
    );

    const result = await loadCharacterSkillQueue(CHAR_ID);

    expect(result?.data).toEqual(queue);
    expect(result?.fromCache).toBe(true);
  });
});

describe('loadCharacterSkillQueueWithStatus (issue #14)', () => {
  it('reports needsReauth on a 403 with nothing cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    const result = await loadCharacterSkillQueueWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });

  it('reports needsReauth false and returns data on a live fetch', async () => {
    const queue = [{ skill_id: 3300, queue_position: 0, finished_level: 5 }];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skillqueue`, () => HttpResponse.json(queue))
    );

    const result = await loadCharacterSkillQueueWithStatus(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(queue);
  });
});

describe('loadImplantBonuses', () => {
  it('sums attribute bonuses across every fitted implant', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/implants`, () =>
        HttpResponse.json([10209, 9899])
      ),
      http.get(`${ESI_BASE_URL}/universe/types/10209`, () =>
        HttpResponse.json({
          type_id: 10209,
          name: 'Memory Augmentation - Improved',
          description: '',
          group_id: 745,
          published: true,
          dogma_attributes: [
            { attribute_id: 177, value: 5.0 },
            { attribute_id: 176, value: 0.0 },
          ],
        })
      ),
      http.get(`${ESI_BASE_URL}/universe/types/9899`, () =>
        HttpResponse.json({
          type_id: 9899,
          name: 'Ocular Filter - Basic',
          description: '',
          group_id: 300,
          published: true,
          dogma_attributes: [{ attribute_id: 178, value: 1.0 }],
        })
      )
    );

    expect(await loadImplantBonuses(CHAR_ID)).toEqual({ memory: 5, perception: 1 });
  });

  it('returns {} when the character has no implants fitted', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/implants`, () => HttpResponse.json([]))
    );
    expect(await loadImplantBonuses(CHAR_ID)).toEqual({});
  });

  it('returns {} when implants are unfetchable and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/implants`, () => HttpResponse.error())
    );
    expect(await loadImplantBonuses(CHAR_ID)).toEqual({});
  });
});

describe('loadUniverseType', () => {
  it('fetches type info and caches it under a shared (non-character) row', async () => {
    const type = {
      type_id: 9899,
      name: 'Ocular Filter - Basic',
      description: 'desc',
      group_id: 300,
      published: true,
    };
    server.use(http.get(`${ESI_BASE_URL}/universe/types/9899`, () => HttpResponse.json(type)));

    const result = await loadUniverseType(9899);

    expect(result?.data).toEqual(type);
    const cached = await db.esiCache.get([0, 'type:9899']);
    expect(cached?.value).toEqual(type);
  });

  it('falls back to the cache offline', async () => {
    const type = {
      type_id: 9899,
      name: 'Ocular Filter - Basic',
      description: 'desc',
      group_id: 300,
      published: true,
    };
    await db.esiCache.put({ characterId: 0, key: 'type:9899', value: type, fetchedAt: 42 });
    server.use(http.get(`${ESI_BASE_URL}/universe/types/9899`, () => HttpResponse.error()));

    const result = await loadUniverseType(9899);

    expect(result).toEqual({
      data: type,
      fetchedAt: new Date(42),
      fromCache: true,
      truncated: false,
    });
  });
});
