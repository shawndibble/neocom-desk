import { describe, expect, it } from 'vitest';
import { AVOID_ROUTE_RETENTION_MS, pruneRuleFor, STATIC_RETENTION_MS } from '@/esi/cachePrune';
import { EDENCOM_SYSTEMS } from '@/engine/route/invasionSystems';
import { rulesCacheKey } from './esiRoute';
import type { RouteRules } from './routeRules';

const JITA = 30000142;
const AMARR = 30002187;
const SAFER: RouteRules = { preference: 'prefer-highsec', securityPenalty: 50, avoid: [] };

/** The key a route's ESI answer was cached under. */
const routeKey = (rules: RouteRules) =>
  `route:${JITA}:${AMARR}:${rulesCacheKey(JITA, AMARR, rules)}`;

describe('rulesCacheKey', () => {
  it('differs for every rule that can change the route', () => {
    const keys = new Set([
      rulesCacheKey(JITA, AMARR, SAFER),
      rulesCacheKey(JITA, AMARR, { ...SAFER, securityPenalty: 10 }),
      rulesCacheKey(JITA, AMARR, { ...SAFER, preference: 'avoid-highsec' }),
      rulesCacheKey(JITA, AMARR, { ...SAFER, avoid: [30045328] }),
      rulesCacheKey(JITA, AMARR, { ...SAFER, avoid: [30045328, 30003068] }),
    ]);
    expect(keys.size).toBe(5);
  });

  it('is the same for the same list in any order, and ignores the two ends', () => {
    expect(rulesCacheKey(JITA, AMARR, { ...SAFER, avoid: [2, 1] })).toBe(
      rulesCacheKey(JITA, AMARR, { ...SAFER, avoid: [1, JITA, 2, AMARR] })
    );
  });

  it('leaves the penalty out of Shorter, which it cannot bend', () => {
    const shortest = { ...SAFER, preference: 'shortest' as const };
    expect(rulesCacheKey(JITA, AMARR, shortest)).toBe(
      rulesCacheKey(JITA, AMARR, { ...shortest, securityPenalty: 90 })
    );
  });

  /*
   * With EDENCOM on the list is 137+ ids; the key carries its size and a
   * hash, not the ids — and pod-kill avoidance changes it hourly, so these
   * rows have to be ones the cache prune knows to drop.
   */
  it('stays short under a long list, and the cache prune drops it early', () => {
    const key = routeKey({ ...SAFER, avoid: EDENCOM_SYSTEMS });
    expect(key.length).toBeLessThan(60);
    expect(pruneRuleFor(key)?.maxAgeMs).toBe(AVOID_ROUTE_RETENTION_MS);
  });

  it('keeps a route with nothing avoided on the long-lived tier', () => {
    expect(pruneRuleFor(routeKey(SAFER))?.maxAgeMs).toBe(STATIC_RETENTION_MS);
    expect(pruneRuleFor(routeKey({ ...SAFER, preference: 'shortest' }))?.maxAgeMs).toBe(
      STATIC_RETENTION_MS
    );
  });
});
