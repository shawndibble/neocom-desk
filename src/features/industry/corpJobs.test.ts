import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import type { CorporationIndustryJob } from '@/esi/endpoints';
import {
  loadAccountCorpIndustryJobs,
  pickCorpReaders,
  unreadableCorpCharacters,
  visibleCorpJobs,
} from './corpJobs';

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

function corpJob(overrides: Partial<CorporationIndustryJob> = {}): CorporationIndustryJob {
  return {
    job_id: 1,
    installer_id: 91,
    activity_id: 1,
    blueprint_id: 5000,
    blueprint_type_id: 1000,
    blueprint_location_id: 60003760,
    output_location_id: 60003760,
    facility_id: 60003760,
    location_id: 60003760,
    runs: 10,
    start_date: '2026-09-01T00:00:00Z',
    end_date: '2026-09-02T00:00:00Z',
    status: 'active',
    ...overrides,
  };
}

describe('pickCorpReaders', () => {
  it('names one reader per corporation, only among characters who can read its jobs', () => {
    const readers = pickCorpReaders([
      { characterId: 1, corporationId: 500, canReadIndustry: false },
      { characterId: 2, corporationId: 500, canReadIndustry: true },
      { characterId: 3, corporationId: 500, canReadIndustry: true },
      { characterId: 4, corporationId: 600, canReadIndustry: false },
    ]);
    expect(readers).toEqual(new Map([[500, 2]]));
  });

  it('prefers the given character when it can read its corporation', () => {
    const readers = pickCorpReaders(
      [
        { characterId: 2, corporationId: 500, canReadIndustry: true },
        { characterId: 3, corporationId: 500, canReadIndustry: true },
      ],
      3
    );
    expect(readers.get(500)).toBe(3);
  });

  it('ignores a preferred character that cannot read', () => {
    const readers = pickCorpReaders(
      [
        { characterId: 2, corporationId: 500, canReadIndustry: true },
        { characterId: 3, corporationId: 500, canReadIndustry: false },
      ],
      3
    );
    expect(readers.get(500)).toBe(2);
  });
});

describe('unreadableCorpCharacters', () => {
  it('lists characters whose corporation no account character can read', () => {
    const candidates = [
      { characterId: 1, corporationId: 500, canReadIndustry: false },
      { characterId: 2, corporationId: 500, canReadIndustry: true },
      { characterId: 4, corporationId: 600, canReadIndustry: false },
    ];
    expect(unreadableCorpCharacters(candidates, pickCorpReaders(candidates))).toEqual([4]);
  });
});

describe('visibleCorpJobs', () => {
  const account = new Set([91, 92]);

  it('keeps jobs installed by a selected account character', () => {
    const jobs = [
      corpJob({ job_id: 1, installer_id: 91 }),
      corpJob({ job_id: 2, installer_id: 92 }),
      corpJob({ job_id: 3, installer_id: 777 }),
    ];
    expect(
      visibleCorpJobs(jobs, {
        accountCharacterIds: account,
        filter: new Set([91]),
        highlightJobId: null,
        personalJobIds: new Set(),
      }).map((job) => job.job_id)
    ).toEqual([1]);
  });

  it("reads 'all' as every account character, never a corpmate outside the account", () => {
    const jobs = [
      corpJob({ job_id: 1, installer_id: 91 }),
      corpJob({ job_id: 2, installer_id: 92 }),
      corpJob({ job_id: 3, installer_id: 777 }),
    ];
    expect(
      visibleCorpJobs(jobs, {
        accountCharacterIds: account,
        filter: 'all',
        highlightJobId: null,
        personalJobIds: new Set(),
      }).map((job) => job.job_id)
    ).toEqual([1, 2]);
  });

  it('always keeps the job an alert pointed at, whoever installed it', () => {
    const jobs = [
      corpJob({ job_id: 1, installer_id: 91 }),
      corpJob({ job_id: 3, installer_id: 777 }),
    ];
    expect(
      visibleCorpJobs(jobs, {
        accountCharacterIds: account,
        filter: new Set([92]),
        highlightJobId: 3,
        personalJobIds: new Set(),
      }).map((job) => job.job_id)
    ).toEqual([3]);
  });

  it('drops a job the personal list already carries', () => {
    const jobs = [corpJob({ job_id: 1, installer_id: 91 })];
    expect(
      visibleCorpJobs(jobs, {
        accountCharacterIds: account,
        filter: 'all',
        highlightJobId: 1,
        personalJobIds: new Set([1]),
      })
    ).toEqual([]);
  });

  it('keeps one copy of a job two readers returned', () => {
    const jobs = [corpJob({ job_id: 1 }), corpJob({ job_id: 1 })];
    expect(
      visibleCorpJobs(jobs, {
        accountCharacterIds: account,
        filter: 'all',
        highlightJobId: null,
        personalJobIds: new Set(),
      })
    ).toHaveLength(1);
  });
});

describe('loadAccountCorpIndustryJobs', () => {
  const CORP_SCOPE = 'esi-industry.read_corporation_jobs.v1';
  const CORP_ID = 98000001;

  async function seed(characterId: number, scopes: string[]) {
    await db.characters.put({
      characterId,
      name: `Pilot ${characterId}`,
      ownerHash: 'oh',
      addedAt: characterId,
    });
    await db.tokens.put({
      characterId,
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 6e5,
      scopes,
    });
  }

  function publicInfo(characterId: number) {
    return http.get(`${ESI_BASE_URL}/characters/${characterId}`, () =>
      HttpResponse.json({
        name: 'x',
        corporation_id: CORP_ID,
        birthday: '2020-01-01T00:00:00Z',
        gender: 'male',
        race_id: 1,
        bloodline_id: 1,
      })
    );
  }

  it('reads the corporation through the character holding the role, listing jobs any account character installed', async () => {
    await seed(1, [CORP_SCOPE]);
    await seed(2, [CORP_SCOPE]);
    server.use(
      publicInfo(1),
      publicInfo(2),
      http.get(`${ESI_BASE_URL}/characters/1/roles`, () => HttpResponse.json({ roles: [] })),
      http.get(`${ESI_BASE_URL}/characters/2/roles`, () =>
        HttpResponse.json({ roles: ['Factory_Manager'] })
      ),
      http.get(`${ESI_BASE_URL}/corporations/${CORP_ID}/industry/jobs`, () =>
        HttpResponse.json([corpJob({ job_id: 7, installer_id: 1 })])
      )
    );

    const snapshot = await loadAccountCorpIndustryJobs(1);
    expect(snapshot.jobs.map((job) => job.job_id)).toEqual([7]);
    expect(snapshot.unreadableCharacterIds).toEqual([]);
    expect(snapshot.fetchedAt).not.toBeNull();
  });

  it('never calls ESI for a character without the corp jobs grant', async () => {
    await seed(1, []);
    // No handlers: an ESI call would be an unhandled request.
    const snapshot = await loadAccountCorpIndustryJobs(1);
    expect(snapshot.jobs).toEqual([]);
    expect(snapshot.unreadableCharacterIds).toEqual([]);
  });

  it('names a granted character whose corporation nobody here can read', async () => {
    await seed(1, [CORP_SCOPE]);
    server.use(
      publicInfo(1),
      http.get(`${ESI_BASE_URL}/characters/1/roles`, () => HttpResponse.json({ roles: [] }))
    );
    const snapshot = await loadAccountCorpIndustryJobs(1);
    expect(snapshot.unreadableCharacterIds).toEqual([1]);
  });
});
