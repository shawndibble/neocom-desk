import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import recorded from './__fixtures__/zkillCharacterStats.json';
import {
  PILOT_STATS_CACHE_MS,
  PILOT_TOP_SHIPS,
  fetchCorporationStats,
  fetchPilotStats,
  parsePilotStats,
  resetPilotStatsCache,
} from './zkillboard';

describe('parsePilotStats', () => {
  it('reads the stated numbers from a recorded zKillboard stats body', () => {
    const parsed = parsePilotStats(recorded);
    expect(parsed).toEqual({
      kind: 'stats',
      stats: {
        kills: 1043,
        losses: 181,
        iskDestroyed: 1888837094625,
        iskLost: 14433463248,
        iskEfficiency: 1888837094625 / (1888837094625 + 14433463248),
        soloKills: 18,
        dangerRatio: 68,
        gangRatio: 99,
        topShips: [
          { shipTypeId: 19724, kills: 317 },
          { shipTypeId: 24694, kills: 130 },
          { shipTypeId: 23911, kills: 119 },
          { shipTypeId: 24688, kills: 89 },
          { shipTypeId: 29984, kills: 43 },
        ],
      },
    });
    expect(PILOT_TOP_SHIPS).toBe(5);
  });

  it('reads zKillboard\'s "Invalid type or id" answer as no history, not a failure', () => {
    expect(parsePilotStats({ error: 'Invalid type or id' })).toEqual({ kind: 'no-history' });
  });

  it('reads any other zKillboard error body as a failure', () => {
    expect(parsePilotStats({ error: 'Rate limited' })).toBeNull();
  });

  it('reads a body with no kill or loss counts as no history', () => {
    expect(parsePilotStats({ activepvp: {}, info: { id: 1 }, topLists: [] })).toEqual({
      kind: 'no-history',
    });
    expect(parsePilotStats({ shipsDestroyed: 0, shipsLost: 0 })).toEqual({ kind: 'no-history' });
  });

  it('fills a missing figure with zero or null rather than inventing one', () => {
    const parsed = parsePilotStats({ shipsLost: 3, iskLost: 900 });
    expect(parsed).toEqual({
      kind: 'stats',
      stats: {
        kills: 0,
        losses: 3,
        iskDestroyed: 0,
        iskLost: 900,
        iskEfficiency: 0,
        soloKills: 0,
        dangerRatio: null,
        gangRatio: null,
        topShips: [],
      },
    });
  });

  it('leaves ISK efficiency unknown when no ISK moved either way', () => {
    const parsed = parsePilotStats({ shipsDestroyed: 1 });
    expect(parsed?.kind === 'stats' && parsed.stats.iskEfficiency).toBeNull();
  });

  it('drops malformed ship entries', () => {
    const parsed = parsePilotStats({
      shipsDestroyed: 2,
      topAllTime: [
        {
          type: 'ship',
          data: [{ kills: 2, shipTypeID: 'x' }, null, { kills: 1, shipTypeID: 587 }],
        },
      ],
    });
    expect(parsed?.kind === 'stats' && parsed.stats.topShips).toEqual([
      { shipTypeId: 587, kills: 1 },
    ]);
  });

  it('returns null for a body that is not an object', () => {
    expect(parsePilotStats(null)).toBeNull();
    expect(parsePilotStats([])).toBeNull();
    expect(parsePilotStats('nope')).toBeNull();
  });
});

describe('fetchPilotStats', () => {
  beforeEach(() => resetPilotStatsCache());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function stubFetch(...responses: (Partial<Response> | Error)[]) {
    const fetchMock = vi.fn();
    for (const response of responses) {
      fetchMock.mockImplementationOnce(() =>
        response instanceof Error ? Promise.reject(response) : Promise.resolve(response as Response)
      );
    }
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  const okBody = (body: unknown): Partial<Response> => ({
    ok: true,
    json: () => Promise.resolve(body),
  });

  it("asks zKillboard's stats API for the pilot, with no custom headers", async () => {
    const fetchMock = stubFetch(okBody(recorded));
    const result = await fetchPilotStats(443630591);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://zkillboard.com/api/stats/characterID/443630591/'
    );
    expect(result.kind).toBe('stats');
  });

  it('reports a failed request, a network error and an unreadable body as failed', async () => {
    stubFetch({ ok: false }, new Error('offline'), okBody(null));
    expect(await fetchPilotStats(1)).toEqual({ kind: 'failed' });
    expect(await fetchPilotStats(1)).toEqual({ kind: 'failed' });
    expect(await fetchPilotStats(1)).toEqual({ kind: 'failed' });
  });

  it('serves a repeat lookup from cache for ten minutes, then asks again', async () => {
    vi.useFakeTimers();
    const fetchMock = stubFetch(okBody(recorded), okBody({ error: 'Invalid type or id' }));
    await fetchPilotStats(7);
    vi.advanceTimersByTime(PILOT_STATS_CACHE_MS - 1);
    expect((await fetchPilotStats(7)).kind).toBe('stats');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect((await fetchPilotStats(7)).kind).toBe('no-history');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('never caches a failure', async () => {
    const fetchMock = stubFetch({ ok: false }, okBody(recorded));
    expect((await fetchPilotStats(9)).kind).toBe('failed');
    expect((await fetchPilotStats(9)).kind).toBe('stats');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchCorporationStats', () => {
  beforeEach(() => resetPilotStatsCache());
  afterEach(() => vi.unstubAllGlobals());

  it("asks zKillboard's stats API for the corporation and reads the same body shape", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(recorded) } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    const result = await fetchCorporationStats(98000001);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://zkillboard.com/api/stats/corporationID/98000001/'
    );
    expect(result.kind).toBe('stats');
  });

  it('never serves a pilot’s cached stats for a corporation sharing the id', async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve(url.includes('characterID') ? recorded : { error: 'Invalid type or id' }),
      } as Response)
    );
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchPilotStats(5)).kind).toBe('stats');
    expect((await fetchCorporationStats(5)).kind).toBe('no-history');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
