import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { corpCacheKey } from '@/esi/cache';
import { STALE_FETCHED_AT } from '@/esi/cacheFixtures';
import { db } from '@/db';
import { loadCorporationIndustryJobs } from './jobs';

const CHAR_ID = 91;
const CORP_ID = 98000001;
const OTHER_CORP_ID = 98000002;

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

function jobsUrl(corporationId: number) {
  return `${ESI_BASE_URL}/corporations/${corporationId}/industry/jobs`;
}

const JOB = {
  job_id: 7,
  installer_id: CHAR_ID,
  activity_id: 1,
  blueprint_id: 1,
  blueprint_type_id: 100,
  blueprint_location_id: 1,
  output_location_id: 1,
  facility_id: 60003760,
  location_id: 60003760,
  runs: 3,
  start_date: '2026-08-29T10:00:00Z',
  end_date: '2026-08-29T14:00:00Z',
  status: 'active',
};

describe('loadCorporationIndustryJobs', () => {
  it('fetches the corporation jobs and caches them under a corp-scoped key', async () => {
    server.use(http.get(jobsUrl(CORP_ID), () => HttpResponse.json([JOB])));

    const result = await loadCorporationIndustryJobs(CHAR_ID, CORP_ID);

    expect(result.cached?.data).toEqual([JOB]);
    expect(result.needsReauth).toBe(false);
    const row = await db.esiCache.get([CHAR_ID, corpCacheKey(CORP_ID, 'industryJobs')]);
    expect(row?.value).toEqual([JOB]);
  });

  /** Issue #293's guarantee, exercised on a real corp read: the key is per corporation. */
  it('never serves one corporation rows under another', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, 'industryJobs'),
      value: [JOB],
      fetchedAt: STALE_FETCHED_AT,
    });

    // The new corp is offline: a bare `industryJobs` key would have handed
    // back the old corp's rows. The corp id is part of the key, so this misses.
    server.use(http.get(jobsUrl(OTHER_CORP_ID), () => HttpResponse.error()));
    const result = await loadCorporationIndustryJobs(CHAR_ID, OTHER_CORP_ID);

    expect(result.cached).toBeNull();
  });

  it('treats a 403 as the in-game role gate, not a re-login prompt', async () => {
    server.use(
      http.get(jobsUrl(CORP_ID), () => HttpResponse.json({ error: 'Forbidden' }, { status: 403 }))
    );

    const result = await loadCorporationIndustryJobs(CHAR_ID, CORP_ID);

    // CCP gates this endpoint on in-game roles server-side, so a 403 is not
    // something logging in again can fix — a ReauthBanner over it is exactly
    // the lock-the-user-can-never-open failure CONTEXT.md round 35 forbids.
    expect(result.needsReauth).toBe(false);
    expect(result.cached).toBeNull();
  });

  it('still reports a 401 as needing re-auth', async () => {
    server.use(
      http.get(jobsUrl(CORP_ID), () =>
        HttpResponse.json({ error: 'token expired' }, { status: 401 })
      )
    );

    const result = await loadCorporationIndustryJobs(CHAR_ID, CORP_ID);

    expect(result.needsReauth).toBe(true);
  });

  it('falls back to the cached corp rows when the live call fails', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: corpCacheKey(CORP_ID, 'industryJobs'),
      value: [JOB],
      fetchedAt: STALE_FETCHED_AT,
    });
    server.use(http.get(jobsUrl(CORP_ID), () => HttpResponse.error()));

    const result = await loadCorporationIndustryJobs(CHAR_ID, CORP_ID);

    expect(result.cached?.data).toEqual([JOB]);
    expect(result.cached?.fromCache).toBe(true);
  });
});
