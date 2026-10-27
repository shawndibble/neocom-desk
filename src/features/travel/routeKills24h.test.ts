import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchRegion = vi.fn();
vi.mock('@/lib/zkillboard', () => ({
  fetchRegionRecentKills: (...args: unknown[]) => fetchRegion(...args),
}));
vi.mock('@/sde/solarSystems', () => ({
  loadSolarSystemsById: () =>
    Promise.resolve(
      new Map([
        [1, { regionId: 10 }],
        [2, { regionId: 10 }],
        [3, { regionId: 20 }],
      ])
    ),
}));

import {
  clearRouteKills24hCache,
  loadRouteKills24h,
  ROUTE_KILLS_WINDOW_SECONDS,
} from './routeKills24h';

const kill = (time: number) => ({ killmailId: time, time, locationId: null, attackers: [] });

beforeEach(() => {
  clearRouteKills24hCache();
  fetchRegion.mockReset();
});

describe('loadRouteKills24h', () => {
  it('asks once per region for a day, and shares the answer across systems and calls', async () => {
    fetchRegion.mockImplementation((regionId: number) =>
      Promise.resolve(
        regionId === 10
          ? { ok: true, bySystem: new Map([[1, [kill(100), kill(200)]]]) }
          : { ok: true, bySystem: new Map() }
      )
    );
    const first = await loadRouteKills24h([1, 2, 3], 1_000);
    expect(first.get(1)).toEqual([100, 200]);
    expect(first.get(2)).toEqual([]);
    expect(first.get(3)).toEqual([]);
    expect(fetchRegion).toHaveBeenCalledTimes(2);
    expect(fetchRegion).toHaveBeenCalledWith(10, ROUTE_KILLS_WINDOW_SECONDS);
    await loadRouteKills24h([1], 2_000);
    expect(fetchRegion).toHaveBeenCalledTimes(2);
  });

  it('leaves systems unknown, not zero, when a region fails or a system has no region', async () => {
    fetchRegion.mockResolvedValue({ ok: false });
    const result = await loadRouteKills24h([1, 3, 99], 1_000);
    expect(result.get(1)).toBeNull();
    expect(result.get(3)).toBeNull();
    expect(result.get(99)).toBeNull();
    // A failure is not cached: the next look asks again.
    await loadRouteKills24h([1], 1_500);
    expect(fetchRegion).toHaveBeenCalledTimes(3);
  });
});
