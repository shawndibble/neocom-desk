import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadCharacterSpSummary } from './characterSp';
import { getLastKnownSpSummary, NO_SP_SUMMARY } from '@/stores/characterSp';

const CHAR_ID = 91;
const NOW = Date.parse('2026-09-01T00:00:00Z');
const SKILLS_SCOPE = 'esi-skills.read_skills.v1';
const QUEUE_SCOPE = 'esi-skills.read_skillqueue.v1';

const skillsPayload = {
  skills: [
    { skill_id: 3300, trained_skill_level: 4, active_skill_level: 4, skillpoints_in_skill: 90_000 },
  ],
  total_sp: 5_000_000,
  unallocated_sp: 12_000,
};

/** Finished before NOW, so /skills' total_sp is missing its SP. */
const queuePayload = [
  {
    skill_id: 3300,
    queue_position: 0,
    finished_level: 5,
    start_date: '2026-07-01T00:00:00Z',
    finish_date: '2026-07-20T00:00:00Z',
    level_end_sp: 512_000,
  },
];

const server = setupServer();

async function seedGrant(scopes: readonly string[], characterId = CHAR_ID): Promise<void> {
  await db.tokens.put({
    characterId,
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: [...scopes],
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.tokens.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadCharacterSpSummary', () => {
  it('reports the total SP corrected by the finished queue, plus unallocated SP', async () => {
    await seedGrant([SKILLS_SCOPE, QUEUE_SCOPE]);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json(skillsPayload)
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skillqueue`, () =>
        HttpResponse.json(queuePayload)
      )
    );

    // 5,000,000 + (512,000 - 90,000): the level the queue finished and
    // /skills has not counted yet.
    expect(await loadCharacterSpSummary(CHAR_ID, NOW)).toEqual({
      totalSp: 5_422_000,
      unallocatedSp: 12_000,
    });
  });

  it('reads /skills alone when the skill-queue scope was never granted', async () => {
    await seedGrant([SKILLS_SCOPE]);
    let queueCalls = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () =>
        HttpResponse.json(skillsPayload)
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skillqueue`, () => {
        queueCalls += 1;
        return HttpResponse.json(queuePayload);
      })
    );

    expect(await loadCharacterSpSummary(CHAR_ID, NOW)).toEqual({
      totalSp: 5_000_000,
      unallocatedSp: 12_000,
    });
    expect(queueCalls).toBe(0);
  });

  it('fetches nothing at all when the skills scope was never granted', async () => {
    // The header rides along on Employment History, which is public: a call
    // here would 401 and raise the shell's stale-grant notice on a view that
    // needs no grant.
    await seedGrant([]);
    let skillCalls = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () => {
        skillCalls += 1;
        return HttpResponse.json(skillsPayload);
      })
    );

    expect(await loadCharacterSpSummary(CHAR_ID, NOW)).toEqual({
      totalSp: null,
      unallocatedSp: null,
    });
    expect(skillCalls).toBe(0);
  });

  it('treats a character with no token row as granting nothing', async () => {
    expect(await loadCharacterSpSummary(CHAR_ID, NOW)).toEqual({
      totalSp: null,
      unallocatedSp: null,
    });
  });

  it('reports nulls rather than throwing when /skills is unreachable and nothing is cached', async () => {
    await seedGrant([SKILLS_SCOPE]);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/skills`, () => HttpResponse.error())
    );

    expect(await loadCharacterSpSummary(CHAR_ID, NOW)).toEqual({
      totalSp: null,
      unallocatedSp: null,
    });
  });
});

describe('getLastKnownSpSummary', () => {
  // Its own character id: `loadCharacterSpSummary` above populates the same
  // module-level cache, and a shared id would make this describe's outcome
  // depend on suite ordering.
  const OTHER_CHAR_ID = 92;

  it('is empty for a character nothing has loaded yet', () => {
    expect(getLastKnownSpSummary(OTHER_CHAR_ID)).toEqual(NO_SP_SUMMARY);
  });

  it('is empty when asked with no character at all', () => {
    expect(getLastKnownSpSummary(null)).toEqual(NO_SP_SUMMARY);
  });

  it('remembers a successful load so a later tab can seed from it instead of blanking', async () => {
    await seedGrant([SKILLS_SCOPE], OTHER_CHAR_ID);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${OTHER_CHAR_ID}/skills`, () =>
        HttpResponse.json(skillsPayload)
      )
    );

    await loadCharacterSpSummary(OTHER_CHAR_ID, NOW);

    expect(getLastKnownSpSummary(OTHER_CHAR_ID)).toEqual({
      totalSp: 5_000_000,
      unallocatedSp: 12_000,
    });
  });

  it('keeps the last good value rather than overwriting it with an all-null read', async () => {
    // Simulates a tab whose own load can't reach /skills (no grant, offline,
    // whatever) mounting after another tab already found real numbers — it
    // must not blank what the previous tab already established.
    await db.tokens.delete(OTHER_CHAR_ID);

    expect(await loadCharacterSpSummary(OTHER_CHAR_ID, NOW)).toEqual(NO_SP_SUMMARY);
    expect(getLastKnownSpSummary(OTHER_CHAR_ID)).toEqual({
      totalSp: 5_000_000,
      unallocatedSp: 12_000,
    });
  });
});
