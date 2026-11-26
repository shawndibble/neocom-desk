import { describe, it, expect, vi, beforeEach } from 'vitest';

import calendarSource from '@/routes/Calendar.tsx?raw';

const loadCalendar = vi.fn();
vi.mock('@/features/character/calendarBoardData', () => ({
  loadCalendarBoard: (...a: unknown[]) => loadCalendar(...a),
}));

const { ROUTE_WARMERS, warmRoute, resetWarmState } = await import('./routeWarm');
const { readRouteSnapshot, resetRouteSnapshots } = await import('@/lib/routeSnapshotCache');
const { purgeCharacterCache } = await import('@/esi/cachePurge');
const { ESI_REGISTRY, isScopeRequired } = await import('@/esi/registry');

const CHARACTER = 42;

const ALL_SCOPES: readonly string[] = ROUTE_WARMERS['/calendar'].endpoints
  .map((endpoint) => ESI_REGISTRY[endpoint].scope)
  .filter(isScopeRequired);

beforeEach(() => {
  loadCalendar.mockReset().mockResolvedValue({ rows: ['a'] });
  resetWarmState();
  resetRouteSnapshots();
});

describe('warm keys match the routes that read them', () => {
  const sources: Record<keyof typeof ROUTE_WARMERS, string> = {
    '/calendar': calendarSource,
  };

  it.each(Object.keys(ROUTE_WARMERS) as (keyof typeof ROUTE_WARMERS)[])(
    '%s warms the key its route actually reads',
    (path) => {
      expect(sources[path]).toContain(`cacheKey: '${ROUTE_WARMERS[path].cacheKey}'`);
    }
  );
});

describe('warmRoute', () => {
  it('composes the snapshot and stores it under the route’s cache key', async () => {
    await warmRoute('/calendar', CHARACTER, ALL_SCOPES);
    expect(loadCalendar).toHaveBeenCalledTimes(1);
    expect(readRouteSnapshot('calendar', CHARACTER)).toEqual({ rows: ['a'] });
  });

  it('issues nothing when a scope the loader reaches is missing', async () => {
    const partial = ALL_SCOPES.filter((s) => s !== 'esi-markets.read_character_orders.v1');
    await warmRoute('/calendar', CHARACTER, partial);
    expect(loadCalendar).not.toHaveBeenCalled();
    expect(readRouteSnapshot('calendar', CHARACTER)).toBeNull();
  });

  it('issues nothing while the grant is still unknown', async () => {
    await warmRoute('/calendar', CHARACTER, undefined);
    expect(loadCalendar).not.toHaveBeenCalled();
  });

  it('issues nothing when no Character is active', async () => {
    await warmRoute('/calendar', null, ALL_SCOPES);
    expect(loadCalendar).not.toHaveBeenCalled();
  });

  it('ignores a route with no warmer', async () => {
    await warmRoute('/settings', CHARACTER, ALL_SCOPES);
    expect(loadCalendar).not.toHaveBeenCalled();
  });

  it('does not recompose a route already retained for this Character', async () => {
    await warmRoute('/calendar', CHARACTER, ALL_SCOPES);
    expect(loadCalendar).toHaveBeenCalledTimes(1);
    await warmRoute('/calendar', CHARACTER, ALL_SCOPES);
    expect(loadCalendar).toHaveBeenCalledTimes(1);
  });

  it('runs one composition for overlapping warms', async () => {
    let release: (value: unknown) => void = () => {};
    loadCalendar.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const first = warmRoute('/calendar', CHARACTER, ALL_SCOPES);
    const second = warmRoute('/calendar', CHARACTER, ALL_SCOPES);
    release({ rows: ['a'] });
    await Promise.all([first, second]);
    expect(loadCalendar).toHaveBeenCalledTimes(1);
  });

  it('warms each Character separately', async () => {
    await warmRoute('/calendar', CHARACTER, ALL_SCOPES);
    await warmRoute('/calendar', 99, ALL_SCOPES);
    expect(loadCalendar).toHaveBeenCalledTimes(2);
    expect(readRouteSnapshot('calendar', 99)).toEqual({ rows: ['a'] });
  });

  it('swallows a loader failure and leaves the cache empty', async () => {
    loadCalendar.mockRejectedValue(new Error('offline'));
    await expect(warmRoute('/calendar', CHARACTER, ALL_SCOPES)).resolves.toBeUndefined();
    expect(readRouteSnapshot('calendar', CHARACTER)).toBeNull();
  });

  it('drops its result if a cache purge lands while it is composing', async () => {
    let release: (value: unknown) => void = () => {};
    loadCalendar.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    const warming = warmRoute('/calendar', CHARACTER, ALL_SCOPES);
    await purgeCharacterCache(CHARACTER);
    release({ rows: ['a'] });
    await warming;
    expect(readRouteSnapshot('calendar', CHARACTER)).toBeNull();
  });

  it('retries after a failure rather than latching the route off', async () => {
    loadCalendar.mockRejectedValueOnce(new Error('offline'));
    await warmRoute('/calendar', CHARACTER, ALL_SCOPES);
    await warmRoute('/calendar', CHARACTER, ALL_SCOPES);
    expect(loadCalendar).toHaveBeenCalledTimes(2);
    expect(readRouteSnapshot('calendar', CHARACTER)).toEqual({ rows: ['a'] });
  });
});
