import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadPublicCharacterInfoWithAge = vi.fn();
const loadWithCache = vi.fn();
const planetInfo = vi.fn();
const jumpsFromCurrent = vi.fn();
vi.mock('@/features/character/publicInfoData', () => ({
  loadPublicCharacterInfoWithAge: (...a: unknown[]) => loadPublicCharacterInfoWithAge(...a),
}));
vi.mock('@/esi/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/esi/cache')>()),
  loadWithCache: (...a: unknown[]) => loadWithCache(...a),
}));
vi.mock('./spaceLookups', () => ({
  planetInfo: (...a: unknown[]) => planetInfo(...a),
}));
vi.mock('@/features/route/jumpsFromCurrent', () => ({
  jumpsFromCurrent: (...a: unknown[]) => jumpsFromCurrent(...a),
}));
vi.mock('@/features/character/names', () => ({
  resolveNames: async () => new Map([[99, 'Test Alliance']]),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: async () => new Map([[30001190, { name: 'X-7OMU' }]]),
}));

import { loadSovRaids } from './sovRaidsLoader';

const ALLIANCE = 99;
const OURS = 30001190;
const THEIRS = 30002000;
const read = (data: unknown, ms = 5000) => ({ data, fetchedAt: new Date(ms), fromCache: false });
const window = { start: '2026-10-23T10:00:00Z', end: '2026-10-23T14:00:00Z' };

function publicReads(
  raidable: unknown = {
    skyhooks: [
      { solar_system_id: OURS, planet_id: 40001, theft_vulnerability: window },
      { solar_system_id: THEIRS, planet_id: 40002, theft_vulnerability: window },
    ],
  },
  claims: unknown = {
    solar_systems: [
      { solar_system_id: OURS, claim: { alliance: { alliance_id: ALLIANCE } } },
      { solar_system_id: THEIRS, claim: { alliance: { alliance_id: 77 } } },
    ],
  }
) {
  loadWithCache.mockImplementation(async (_id: number, key: string) => {
    if (key === 'skyhooks-raidable') return raidable === null ? null : read(raidable, 4000);
    if (key === 'sovereignty-systems') return claims === null ? null : read(claims, 9000);
    throw new Error(`unexpected read ${key}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  loadPublicCharacterInfoWithAge.mockResolvedValue({
    info: { corporation_id: 1, alliance_id: ALLIANCE },
    fetchedAt: new Date(1000),
  });
  planetInfo.mockResolvedValue(new Map([[40001, { systemId: OURS, name: 'X-7OMU IV' }]]));
  jumpsFromCurrent.mockResolvedValue(new Map([[OURS, 7]]));
  publicReads();
});

describe('loadSovRaids', () => {
  it("keeps raidable skyhooks to the alliance's space, and looks up only those", async () => {
    const feed = await loadSovRaids(1);
    expect(planetInfo).toHaveBeenCalledWith([40001]);
    expect(jumpsFromCurrent).toHaveBeenCalledWith(1, [OURS]);
    expect(feed).toMatchObject({
      alliance: { id: ALLIANCE, name: 'Test Alliance' },
      holdsSov: true,
      skyhooks: [
        {
          key: `${OURS}:40001`,
          systemId: OURS,
          planetName: 'X-7OMU IV',
          window: { startMs: Date.parse(window.start), endMs: Date.parse(window.end) },
        },
      ],
      fetchedAt: new Date(4000),
    });
    expect(feed.systemNames.get(OURS)).toBe('X-7OMU');
    expect(feed.jumps.get(OURS)).toBe(7);
  });

  it('reads nothing public for a Character in no alliance', async () => {
    loadPublicCharacterInfoWithAge.mockResolvedValue({
      info: { corporation_id: 1 },
      fetchedAt: new Date(1000),
    });
    const feed = await loadSovRaids(1);
    expect(feed.alliance).toBeNull();
    expect(feed.skyhooks).toEqual([]);
    expect(loadWithCache).not.toHaveBeenCalled();
  });

  it('throws when the Character record is unread: unknown is not "no alliance"', async () => {
    loadPublicCharacterInfoWithAge.mockResolvedValue(null);
    await expect(loadSovRaids(1)).rejects.toThrow();
  });

  it('says the alliance holds no sov when no claim is its own', async () => {
    publicReads(undefined, {
      solar_systems: [{ solar_system_id: THEIRS, claim: { alliance: { alliance_id: 77 } } }],
    });
    const feed = await loadSovRaids(1);
    expect(feed.holdsSov).toBe(false);
    expect(feed.skyhooks).toEqual([]);
    expect(planetInfo).toHaveBeenCalledWith([]);
  });

  it('throws when either public list is unread, so the last good read stays', async () => {
    publicReads(null);
    await expect(loadSovRaids(1)).rejects.toThrow();
    publicReads(undefined, null);
    await expect(loadSovRaids(1)).rejects.toThrow();
  });

  it('keeps a skyhook whose window is unreadable as unknown, never safe', async () => {
    publicReads({ skyhooks: [{ solar_system_id: OURS, planet_id: 40001 }] });
    const feed = await loadSovRaids(1);
    expect(feed.skyhooks[0]?.window).toBeNull();
  });
});
