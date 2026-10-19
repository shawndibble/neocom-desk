/**
 * Parity tests: `functions/src` hand-mirrors a few pieces of `src/` (it is a
 * separate package with its own tsconfig and no `@/` alias, so it cannot
 * import them). Each test imports BOTH copies and asserts equal behaviour, so
 * a change to one side that skips the other fails here instead of drifting
 * silently. Only modules free of `functions/`-only dependencies (`jose`,
 * `firebase-admin`) can be imported here, since root has no copy of them. The test lives at the root because root resolution can reach
 * `functions/src`; the reverse (`functions/` importing `src/`) cannot.
 */
import { describe, expect, it } from 'vitest';
import { TRADE_HUBS } from '@/market/hubs';
import { miningPricesUrl } from '@/features/market/hubSnapshot';
import { SNAPSHOT_HUBS, miningPricesR2Key } from '../functions/src/miningHubPrices';
import { MARKET_OPEN_PRICES_REGION_IDS } from '../functions/src/marketOpenPrices';

describe('trade hubs', () => {
  it('SNAPSHOT_HUBS matches TRADE_HUBS ids, stations and regions, in order', () => {
    expect(SNAPSHOT_HUBS.map((h) => ({ ...h }))).toEqual(
      TRADE_HUBS.map((h) => ({ id: h.id, stationId: h.stationId, regionId: h.regionId }))
    );
  });

  it('MARKET_OPEN_PRICES_REGION_IDS is exactly the hub regions', () => {
    expect([...MARKET_OPEN_PRICES_REGION_IDS].sort()).toEqual(
      TRADE_HUBS.map((h) => h.regionId).sort()
    );
  });
});

describe('hub station mining prices', () => {
  it.each(TRADE_HUBS)('the client reads the object the writer publishes for $id', (hub) => {
    expect(miningPricesUrl(hub, '2026-10')).toMatch(
      new RegExp(`^https://[^/]+/${miningPricesR2Key(hub.id, '2026-10')}$`)
    );
  });
});
