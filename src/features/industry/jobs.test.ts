import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import type { IndustryJob } from '@/esi/endpoints';
import {
  loadCharacterIndustryJobs,
  sortJobsBySoonest,
  jobProgress,
  isJobDone,
  isCompletingSoon,
  secondsRemaining,
  activityI18nKey,
  contextMenuTypeId,
  summarizeJobs,
  loadAllCharactersIndustryJobs,
  flattenJobsWithCharacter,
  type JobsFanOutEntry,
} from './jobs';

const CHAR_ID = 91;
const JOBS_SCOPE = 'esi-industry.read_character_jobs.v1';
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

function job(overrides: Partial<IndustryJob> = {}): IndustryJob {
  return {
    job_id: 1,
    activity_id: 1,
    blueprint_type_id: 638,
    facility_id: 60003760,
    station_id: 60003760,
    runs: 1,
    start_date: '2026-08-29T10:00:00Z',
    end_date: '2026-08-29T12:00:00Z',
    status: 'active',
    ...overrides,
  };
}

describe('loadCharacterIndustryJobs', () => {
  const payload = [job()];

  it('fetches from ESI, writes the cache, and reports fromCache: false', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/industry/jobs`, () =>
        HttpResponse.json(payload)
      )
    );

    const result = await loadCharacterIndustryJobs(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.fromCache).toBe(false);
    expect(result.cached?.data).toEqual(payload);
    const cached = await db.esiCache.get([CHAR_ID, 'industryJobs']);
    expect(cached?.value).toEqual(payload);
  });

  it('falls back to the cache when ESI is unreachable (offline)', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'industryJobs',
      value: payload,
      fetchedAt: 1234,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/industry/jobs`, () => HttpResponse.error())
    );

    const result = await loadCharacterIndustryJobs(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.fromCache).toBe(true);
    expect(result.cached?.data).toEqual(payload);
  });

  it('returns null cached / needsReauth false when ESI fails and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/industry/jobs`, () => HttpResponse.error())
    );

    const result = await loadCharacterIndustryJobs(CHAR_ID);

    expect(result.cached).toBeNull();
    expect(result.needsReauth).toBe(false);
  });

  it('surfaces a distinct needsReauth state on 403, not a generic offline fallback', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/industry/jobs`, () =>
        HttpResponse.json({ error: 'token is not valid for scope' }, { status: 403 })
      )
    );

    const result = await loadCharacterIndustryJobs(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });

  it('ignores an existing cache row on 403: nothing to fall back to for a scope the character never granted', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'industryJobs',
      value: payload,
      fetchedAt: 1234,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/industry/jobs`, () =>
        HttpResponse.json({ error: 'token is not valid for scope' }, { status: 403 })
      )
    );

    const result = await loadCharacterIndustryJobs(CHAR_ID);

    expect(result).toEqual({ cached: null, needsReauth: true });
  });

  it('does not treat a non-403 error status as needing reauth', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/industry/jobs`, () =>
        HttpResponse.json({ error: 'internal server error' }, { status: 500 })
      )
    );

    const result = await loadCharacterIndustryJobs(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached).toBeNull();
  });
});

describe('sortJobsBySoonest', () => {
  it('orders by end_date ascending, ignoring input order', () => {
    const soon = job({ job_id: 1, end_date: '2026-08-29T11:00:00Z' });
    const later = job({ job_id: 2, end_date: '2026-08-29T13:00:00Z' });
    const soonest = job({ job_id: 3, end_date: '2026-08-29T10:30:00Z' });

    expect(sortJobsBySoonest([later, soon, soonest]).map((j) => j.job_id)).toEqual([3, 1, 2]);
  });

  it('does not mutate the input array', () => {
    const input = [job({ job_id: 2, end_date: '2026-08-29T13:00:00Z' }), job({ job_id: 1 })];
    const copy = [...input];
    sortJobsBySoonest(input);
    expect(input).toEqual(copy);
  });
});

describe('jobProgress', () => {
  const j = job({ start_date: '2026-08-29T10:00:00Z', end_date: '2026-08-29T12:00:00Z' });

  it('is 0 at the start', () => {
    expect(jobProgress(j, Date.parse('2026-08-29T10:00:00Z'))).toBe(0);
  });

  it('is 0.5 halfway through', () => {
    expect(jobProgress(j, Date.parse('2026-08-29T11:00:00Z'))).toBe(0.5);
  });

  it('clamps to 1 past the end', () => {
    expect(jobProgress(j, Date.parse('2026-08-29T13:00:00Z'))).toBe(1);
  });

  it('clamps to 0 before the start', () => {
    expect(jobProgress(j, Date.parse('2026-08-29T09:00:00Z'))).toBe(0);
  });

  it('guards a zero-length window: 1 once at/after end, 0 before', () => {
    const zero = job({ start_date: '2026-08-29T10:00:00Z', end_date: '2026-08-29T10:00:00Z' });
    expect(jobProgress(zero, Date.parse('2026-08-29T10:00:00Z'))).toBe(1);
    expect(jobProgress(zero, Date.parse('2026-08-29T09:00:00Z'))).toBe(0);
  });
});

describe('isJobDone / isCompletingSoon / secondsRemaining', () => {
  const j = job({ end_date: '2026-08-29T12:00:00Z' });

  it('isJobDone is false before end_date, true at/after', () => {
    expect(isJobDone(j, Date.parse('2026-08-29T11:59:59Z'))).toBe(false);
    expect(isJobDone(j, Date.parse('2026-08-29T12:00:00Z'))).toBe(true);
    expect(isJobDone(j, Date.parse('2026-08-29T13:00:00Z'))).toBe(true);
  });

  it('isCompletingSoon is true within the next hour, false beyond it or once done', () => {
    expect(isCompletingSoon(j, Date.parse('2026-08-29T11:30:00Z'))).toBe(true);
    expect(isCompletingSoon(j, Date.parse('2026-08-29T10:00:00Z'))).toBe(false);
    expect(isCompletingSoon(j, Date.parse('2026-08-29T12:00:00Z'))).toBe(false);
  });

  it('secondsRemaining counts down and clamps at 0', () => {
    expect(secondsRemaining(j, Date.parse('2026-08-29T11:00:00Z'))).toBe(3600);
    expect(secondsRemaining(j, Date.parse('2026-08-29T13:00:00Z'))).toBe(0);
  });
});

describe('activityI18nKey', () => {
  it.each([
    [1, 'industry.activity.manufacturing'],
    [3, 'industry.activity.timeEfficiencyResearch'],
    [4, 'industry.activity.materialEfficiencyResearch'],
    [5, 'industry.activity.copying'],
    [8, 'industry.activity.invention'],
    [11, 'industry.activity.reaction'],
  ])('maps activity_id %i to %s', (id, key) => {
    expect(activityI18nKey(id)).toBe(key);
  });

  it('falls back to a generic key for an unmapped activity_id', () => {
    expect(activityI18nKey(9)).toBe('industry.activity.unknown');
  });
});

describe('contextMenuTypeId', () => {
  it('uses the manufactured product when the job has one', () => {
    expect(contextMenuTypeId({ blueprint_type_id: 638, product_type_id: 587 })).toBe(587);
  });

  it('falls back to the blueprint itself for research/copying/invention jobs (no product)', () => {
    expect(contextMenuTypeId({ blueprint_type_id: 638, product_type_id: undefined })).toBe(638);
  });
});

describe('summarizeJobs', () => {
  const NOW = Date.parse('2026-08-29T11:00:00Z');

  it('counts running and done jobs and names the soonest unfinished one', () => {
    const summary = summarizeJobs(
      [
        job({ job_id: 1, end_date: '2026-08-29T13:00:00Z' }),
        job({ job_id: 2, end_date: '2026-08-29T10:30:00Z' }),
        job({ job_id: 3, end_date: '2026-08-29T11:20:00Z' }),
      ],
      NOW
    );
    expect(summary.running).toBe(2);
    expect(summary.done).toBe(1);
    expect(summary.next?.job.job_id).toBe(3);
    expect(summary.next?.seconds).toBe(20 * 60);
  });

  it('has no "next" when every job is done', () => {
    const summary = summarizeJobs([job({ end_date: '2026-08-29T10:00:00Z' })], NOW);
    expect(summary).toEqual({ running: 0, done: 1, next: null });
  });

  it('is empty for no jobs', () => {
    expect(summarizeJobs([], NOW)).toEqual({ running: 0, done: 0, next: null });
  });
});

const CHAR_A = 1;
const CHAR_B = 2;
const CHAR_C = 3;

describe('loadAllCharactersIndustryJobs', () => {
  beforeEach(async () => {
    await db.characters.bulkPut([
      { characterId: CHAR_A, name: 'Alice', ownerHash: 'oh1', addedAt: 1 },
      { characterId: CHAR_B, name: 'Bob', ownerHash: 'oh2', addedAt: 2 },
      { characterId: CHAR_C, name: 'Carol', ownerHash: 'oh3', addedAt: 3 },
    ]);
  });

  it('skips a Character without the industry-jobs scope, never calling ESI for it', async () => {
    await db.tokens.bulkPut([tokenWith(CHAR_A, [JOBS_SCOPE]), tokenWith(CHAR_B, [JOBS_SCOPE])]);
    // CHAR_C has no token at all: never granted anything.
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/industry/jobs`, () =>
        HttpResponse.json([job({ job_id: 1 })])
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/industry/jobs`, () =>
        HttpResponse.json([job({ job_id: 2 })])
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_C}/industry/jobs`, () => {
        throw new Error('must not fetch a Character without the industry-jobs scope');
      })
    );

    const { entries, skipped } = await loadAllCharactersIndustryJobs();

    expect(entries.map((e) => e.characterId)).toEqual([CHAR_A, CHAR_B]);
    expect(skipped).toEqual([{ characterId: CHAR_C, name: 'Carol' }]);
  });

  it('surfaces needsReauth on one Character entry without failing the others', async () => {
    await db.tokens.bulkPut([
      tokenWith(CHAR_A, [JOBS_SCOPE]),
      tokenWith(CHAR_B, [JOBS_SCOPE]),
      tokenWith(CHAR_C, [JOBS_SCOPE]),
    ]);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/industry/jobs`, () =>
        HttpResponse.json([job({ job_id: 1 })])
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/industry/jobs`, () =>
        HttpResponse.json({ error: 'token is not valid for scope' }, { status: 403 })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_C}/industry/jobs`, () =>
        HttpResponse.json([job({ job_id: 3 })])
      )
    );

    const { entries, skipped } = await loadAllCharactersIndustryJobs();

    expect(skipped).toEqual([]);
    expect(entries.map((e) => e.characterId)).toEqual([CHAR_A, CHAR_B, CHAR_C]);

    const bob = entries.find((e) => e.characterId === CHAR_B);
    expect(bob?.result.needsReauth).toBe(true);
    expect(bob?.result.cached).toBeNull();

    const alice = entries.find((e) => e.characterId === CHAR_A);
    expect(alice?.result.needsReauth).toBe(false);
    expect(alice?.result.cached?.data).toEqual([job({ job_id: 1 })]);
  });

  it('keeps entries in stable, character-list order regardless of which fetch resolves first', async () => {
    await db.tokens.bulkPut([
      tokenWith(CHAR_A, [JOBS_SCOPE]),
      tokenWith(CHAR_B, [JOBS_SCOPE]),
      tokenWith(CHAR_C, [JOBS_SCOPE]),
    ]);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/industry/jobs`, () =>
        HttpResponse.json([job({ job_id: 1 })])
      ),
      // CHAR_B is deliberately the slowest response of the three.
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/industry/jobs`, async () => {
        await delay(30);
        return HttpResponse.json([job({ job_id: 2 })]);
      }),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_C}/industry/jobs`, () =>
        HttpResponse.json([job({ job_id: 3 })])
      )
    );

    const { entries } = await loadAllCharactersIndustryJobs();

    expect(entries.map((e) => e.characterId)).toEqual([CHAR_A, CHAR_B, CHAR_C]);
  });
});

describe('flattenJobsWithCharacter', () => {
  function entry(overrides: Partial<JobsFanOutEntry> = {}): JobsFanOutEntry {
    return {
      characterId: CHAR_A,
      characterName: 'Alice',
      result: { cached: null, needsReauth: false },
      ...overrides,
    };
  }

  it('tags every job with its owning character', () => {
    const flattened = flattenJobsWithCharacter(
      [
        entry({
          characterId: CHAR_A,
          characterName: 'Alice',
          result: {
            cached: {
              data: [job({ job_id: 1 })],
              fetchedAt: new Date(),
              fromCache: false,
              truncated: false,
            },
            needsReauth: false,
          },
        }),
      ],
      'all'
    );
    expect(flattened).toEqual([
      { ...job({ job_id: 1 }), characterId: CHAR_A, characterName: 'Alice' },
    ]);
  });

  it('excludes a Character not in the filter', () => {
    const withJobs = (characterId: number, characterName: string): JobsFanOutEntry =>
      entry({
        characterId,
        characterName,
        result: {
          cached: {
            data: [job({ job_id: characterId })],
            fetchedAt: new Date(),
            fromCache: false,
            truncated: false,
          },
          needsReauth: false,
        },
      });

    const flattened = flattenJobsWithCharacter(
      [withJobs(CHAR_A, 'Alice'), withJobs(CHAR_B, 'Bob')],
      new Set([CHAR_A])
    );

    expect(flattened.map((j) => j.characterId)).toEqual([CHAR_A]);
  });

  it('treats a needsReauth or never-fetched entry as no jobs, not an error', () => {
    const flattened = flattenJobsWithCharacter(
      [entry({ result: { cached: null, needsReauth: true } })],
      'all'
    );
    expect(flattened).toEqual([]);
  });
});
