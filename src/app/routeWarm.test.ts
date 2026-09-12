import { describe, it, expect, vi, beforeEach } from 'vitest';

// Raw route source, for the drift check below — the same technique
// `routeScopes.test.ts` uses to keep a hand-written table honest.
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

/** Every scope `/calendar`'s six endpoints require, read from the registry. */
const ALL_SCOPES: readonly string[] = ROUTE_WARMERS['/calendar'].endpoints
  .map((endpoint) => ESI_REGISTRY[endpoint].scope)
  .filter(isScopeRequired);

beforeEach(() => {
  loadCalendar.mockReset().mockResolvedValue({ rows: ['a'] });
  resetWarmState();
  resetRouteSnapshots();
});

/**
 * The whole mechanism hangs on the table's `cacheKey` being byte-identical to
 * the literal the route hands `useRouteSnapshot`. Drift is silent — the warm
 * writes under a key nothing ever reads, and the spinner simply comes back —
 * so it is checked against the route's own source rather than trusted.
 */
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

  /**
   * The constraint `prefetch.ts` exists to respect: a scope-gated endpoint
   * answers 403 for a Character without the grant, and `esi/cache.ts` routes
   * that to the shell-wide re-auth notice. Sweeping the pointer down the rail
   * must not paint that banner.
   */
  it('issues nothing when a scope the loader reaches is missing', async () => {
    // Holds the calendar grant itself but not the orders one the board also
    // pulls — the case a route-level lock cannot see, since /calendar is
    // UNGATED and would read as unlocked for everyone.
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

  /** Hover fires per pointer entry, and the click behind it mounts the route. */
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

  /** A speculative read must never surface; the view reports its own failure. */
  it('swallows a loader failure and leaves the cache empty', async () => {
    loadCalendar.mockRejectedValue(new Error('offline'));
    await expect(warmRoute('/calendar', CHARACTER, ALL_SCOPES)).resolves.toBeUndefined();
    expect(readRouteSnapshot('calendar', CHARACTER)).toBeNull();
  });

  /**
   * A purge is how a scope revoke or owner change gets data off the screen,
   * and a warm holds a composed snapshot across an await with nothing watching
   * it. Writing that back afterwards would put the purged rows straight back
   * into the cache the view reads.
   */
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
