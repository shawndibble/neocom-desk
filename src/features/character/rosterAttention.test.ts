import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { writeCached } from '@/esi/cache';
import { loadRosterAttention } from './rosterAttention';
import { loadCharacterIndustryJobs } from '@/features/industry/jobs';
import { loadCharacterPlanets, loadAllColonyDetails } from '@/features/pi/data';

vi.mock('@/features/industry/jobs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/industry/jobs')>();
  return { ...actual, loadCharacterIndustryJobs: vi.fn() };
});
vi.mock('@/features/pi/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/pi/data')>();
  return { ...actual, loadCharacterPlanets: vi.fn(), loadAllColonyDetails: vi.fn() };
});

const JOBS_SCOPE = 'esi-industry.read_character_jobs.v1';
const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';
const CHAR_A = 91;
const CHAR_B = 92;
const NOW = Date.parse('2026-09-09T00:00:00Z');
const EXPIRY_SOON = '2026-09-09T06:00:00Z';
const EXPIRY_FAR = '2026-10-01T00:00:00Z';

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

function job(jobId: number, endDate: string, activityId = 1) {
  return {
    job_id: jobId,
    end_date: endDate,
    start_date: '2026-09-01T00:00:00Z',
    blueprint_type_id: 1,
    activity_id: activityId,
    facility_id: 1,
    station_id: 1,
    runs: 1,
    status: 'active' as const,
  };
}

function planet(planetId: number) {
  return {
    solar_system_id: 30000142,
    planet_id: planetId,
    planet_type: 'temperate' as const,
    owner_id: 1,
    last_update: '2026-08-30T00:00:00Z',
    upgrade_level: 3,
    num_pins: 1,
  };
}

function extractorDetail(pinId: number, expiryTime: string) {
  return {
    links: [],
    routes: [],
    pins: [
      {
        pin_id: pinId,
        type_id: 2848,
        latitude: 0,
        longitude: 0,
        expiry_time: expiryTime,
        extractor_details: { heads: [{ head_id: 1, latitude: 0, longitude: 0 }] },
      },
    ],
  };
}

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.esiCache.clear();
  vi.mocked(loadCharacterIndustryJobs).mockReset();
  vi.mocked(loadCharacterPlanets).mockReset();
  vi.mocked(loadAllColonyDetails).mockReset();
});

describe('loadRosterAttention (cache-only)', () => {
  it('reports running job counts per category and worst colony attention per character', async () => {
    await addCharacter(CHAR_A, 'Pilot A', [JOBS_SCOPE, PLANETS_SCOPE]);
    await writeCached(
      CHAR_A,
      'industryJobs',
      [job(1, '2026-09-10T00:00:00Z', 1), job(2, '2026-09-10T00:00:00Z', 8)],
      100
    );
    await writeCached(CHAR_A, 'planets', [planet(40000001)], 200);
    await writeCached(CHAR_A, 'planet:40000001', extractorDetail(1, EXPIRY_SOON), 200);

    const [entry] = await loadRosterAttention({ now: NOW });

    expect(entry.characterId).toBe(CHAR_A);
    expect(entry.jobCounts).toEqual({ manufacturing: 1, science: 1, reaction: 0 });
    expect(entry.jobCountsFetchedAt).toEqual(new Date(100));
    expect(entry.piAttention).toBe('expiring-soon');
    expect(entry.piFetchedAt).toEqual(new Date(200));
  });

  it('is undefined for a character lacking the scope, without reading its cache', async () => {
    await addCharacter(CHAR_A, 'Scopeless', []);
    // Seeded anyway, to prove the missing scope — not a missing row — is why this reads undefined.
    await writeCached(CHAR_A, 'industryJobs', [job(1, '2026-09-10T00:00:00Z')], 100);

    const [entry] = await loadRosterAttention({ now: NOW });

    expect(entry.jobCounts).toBeUndefined();
    expect(entry.piAttention).toBeUndefined();
  });

  it('is undefined when scoped but nothing has been cached yet', async () => {
    await addCharacter(CHAR_A, 'Pilot A', [JOBS_SCOPE, PLANETS_SCOPE]);

    const [entry] = await loadRosterAttention({ now: NOW });

    expect(entry.jobCounts).toBeUndefined();
    expect(entry.piAttention).toBeUndefined();
  });

  it('is undefined (not zero colonies-worth of attention) when a scoped character has none', async () => {
    await addCharacter(CHAR_A, 'Pilot A', [PLANETS_SCOPE]);
    await writeCached(CHAR_A, 'planets', [], 200);

    const [entry] = await loadRosterAttention({ now: NOW });

    expect(entry.piAttention).toBeUndefined();
  });

  it('covers every character on the device, independently', async () => {
    await addCharacter(CHAR_A, 'Pilot A', [JOBS_SCOPE]);
    await addCharacter(CHAR_B, 'Pilot B', [JOBS_SCOPE]);
    await writeCached(CHAR_A, 'industryJobs', [job(1, '2026-09-10T00:00:00Z')], 100);
    await writeCached(CHAR_B, 'industryJobs', [], 100);

    const entries = await loadRosterAttention({ now: NOW });

    expect(entries.find((e) => e.characterId === CHAR_A)?.jobCounts?.manufacturing).toBe(1);
    expect(entries.find((e) => e.characterId === CHAR_B)?.jobCounts?.manufacturing).toBe(0);
  });
});

describe('loadRosterAttention (live)', () => {
  it('fetches live and reports the result', async () => {
    await addCharacter(CHAR_A, 'Pilot A', [JOBS_SCOPE, PLANETS_SCOPE]);
    vi.mocked(loadCharacterIndustryJobs).mockResolvedValue({
      cached: {
        data: [job(1, '2026-09-10T00:00:00Z')],
        fetchedAt: new Date(NOW),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    vi.mocked(loadCharacterPlanets).mockResolvedValue({
      cached: {
        data: [planet(40000001)],
        fetchedAt: new Date(NOW),
        fromCache: false,
        truncated: false,
      },
      needsReauth: false,
    });
    vi.mocked(loadAllColonyDetails).mockResolvedValue(
      new Map([
        [
          40000001,
          {
            cached: {
              data: extractorDetail(1, EXPIRY_FAR),
              fetchedAt: new Date(NOW),
              fromCache: false,
              truncated: false,
            },
            needsReauth: false,
          },
        ],
      ])
    );

    const [entry] = await loadRosterAttention({ live: true, now: NOW });

    expect(entry.jobCounts).toEqual({ manufacturing: 1, science: 0, reaction: 0 });
    expect(entry.piAttention).toBe('healthy');
  });

  it('leaves a field unset rather than failing the whole character when one read throws', async () => {
    await addCharacter(CHAR_A, 'Pilot A', [JOBS_SCOPE, PLANETS_SCOPE]);
    vi.mocked(loadCharacterIndustryJobs).mockRejectedValue(new Error('boom'));
    vi.mocked(loadCharacterPlanets).mockResolvedValue({
      cached: { data: [], fetchedAt: new Date(NOW), fromCache: false, truncated: false },
      needsReauth: false,
    });

    const [entry] = await loadRosterAttention({ live: true, now: NOW });

    expect(entry.jobCounts).toBeUndefined();
    expect(entry.piAttention).toBeUndefined();
  });
});
