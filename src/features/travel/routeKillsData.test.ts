import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchSystemRecentKills = vi.fn();
vi.mock('@/lib/zkillboard', () => ({
  fetchSystemRecentKills: (id: number) => fetchSystemRecentKills(id),
}));

const getUniverseStargate = vi.fn();
vi.mock('@/esi/endpoints', () => ({
  getUniverseStargate: (id: number) => getUniverseStargate(id),
}));

const lookupNpcStation = vi.fn();
vi.mock('@/sde/npcStations', () => ({
  lookupNpcStation: (id: number) => lookupNpcStation(id),
}));

vi.mock('@/sde/loadSde', () => ({
  loadTypes: async () => ({ '22456': { name: 'Sabre', groupID: 541, volume: 1 } }),
}));

const {
  RECENT_KILLS_TTL_MS,
  clearRouteKillCaches,
  loadSystemRecentKills,
  loadTypeGroups,
  resolveKillLocations,
} = await import('./routeKillsData');

beforeEach(() => {
  clearRouteKillCaches();
  fetchSystemRecentKills.mockReset();
  getUniverseStargate.mockReset();
  lookupNpcStation.mockReset();
});

describe('loadSystemRecentKills', () => {
  it('serves a system from cache for five minutes, then asks again', async () => {
    fetchSystemRecentKills.mockResolvedValue({ ok: true, kills: [] });
    await loadSystemRecentKills(1, 0);
    await loadSystemRecentKills(1, RECENT_KILLS_TTL_MS - 1);
    expect(fetchSystemRecentKills).toHaveBeenCalledTimes(1);
    await loadSystemRecentKills(1, RECENT_KILLS_TTL_MS);
    expect(fetchSystemRecentKills).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure, so the next look retries', async () => {
    fetchSystemRecentKills.mockResolvedValueOnce({ ok: false });
    expect(await loadSystemRecentKills(1, 0)).toEqual({ ok: false });
    fetchSystemRecentKills.mockResolvedValueOnce({ ok: true, kills: [] });
    expect(await loadSystemRecentKills(1, 1)).toEqual({ ok: true, kills: [] });
  });
});

describe('resolveKillLocations', () => {
  it('names stargates from ESI once per session and stations from the snapshot', async () => {
    getUniverseStargate.mockResolvedValue({
      data: {
        stargate_id: 50014002,
        name: 'Stargate (Nourvukaiken)',
        system_id: 30002813,
        destination: { stargate_id: 50014001, system_id: 30001376 },
      },
    });
    lookupNpcStation.mockResolvedValue({ id: 60012157, name: 'Tama VII', systemId: 30002813 });

    const first = await resolveKillLocations([50014002, 60012157, 40178880, 50014002]);
    expect(first).toEqual(
      new Map([
        [
          50014002,
          { kind: 'stargate', name: 'Stargate (Nourvukaiken)', destinationSystemId: 30001376 },
        ],
        [60012157, { kind: 'station', name: 'Tama VII' }],
      ])
    );
    await resolveKillLocations([50014002]);
    expect(getUniverseStargate).toHaveBeenCalledTimes(1);
  });

  it('leaves a location out when it cannot be read, and retries it next time', async () => {
    getUniverseStargate.mockRejectedValueOnce(new Error('offline'));
    lookupNpcStation.mockResolvedValue(null);
    expect(await resolveKillLocations([50014002, 1_000_000_000_000])).toEqual(new Map());

    getUniverseStargate.mockResolvedValueOnce({
      data: {
        stargate_id: 50014002,
        name: 'Stargate (Nourvukaiken)',
        system_id: 30002813,
        destination: { stargate_id: 50014001, system_id: 30001376 },
      },
    });
    expect((await resolveKillLocations([50014002])).size).toBe(1);
  });
});

describe('loadTypeGroups', () => {
  it('looks a type up to its group, and an unknown type to undefined', async () => {
    const groupOf = await loadTypeGroups();
    expect(groupOf(22456)).toBe(541);
    expect(groupOf(1)).toBeUndefined();
  });
});
