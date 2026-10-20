/**
 * Parity tests: `functions/src` hand-mirrors a few pieces of `src/` (it is a
 * separate package with its own tsconfig and no `@/` alias, so it cannot
 * import them). Each test imports BOTH copies and asserts equal behaviour, so
 * a change to one side that skips the other fails here instead of drifting
 * silently. Only modules free of `functions/`-only dependencies (`jose`,
 * `firebase-admin`, `csv-parse`) can be imported here, since root has no copy of them. The test lives at the root because root resolution can reach
 * `functions/src`; the reverse (`functions/` importing `src/`) cannot.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { TRADE_HUBS } from '@/market/hubs';
import { MARKET_OPEN_PRICES_REGION_IDS, SNAPSHOT_HUBS } from '../functions/src/marketOpenPrices';
import {
  FIRED_RETENTION_MS,
  isDue,
  isPastRetention,
  type StoredProjectionRow,
} from '../functions/src/dispatchProjections';
import type { ProjectionRowInput } from '../functions/src/projectionRow';
import { feedPurgeCutoff, isPurgeableFeedRow } from '../functions/src/purgeFeed';
import { workbenchFitsR2Key } from '../functions/src/workbenchFits';
import { FEED_SYNC_WINDOW_MS, rowsWithinSyncWindow } from '@/features/notifications/feed';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import type { ProjectionRow } from '@/engine/projection';
import { workbenchFitsUrl } from '@/features/fittings/workbenchFits';

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

describe('Notification Feed retention', () => {
  it('FIRED_RETENTION_MS equals the client FEED_SYNC_WINDOW_MS', () => {
    expect(FIRED_RETENTION_MS).toBe(FEED_SYNC_WINDOW_MS);
  });

  const now = 1_800_000_000_000;
  it.each([-1, 0, 1])(
    'a row is past backend retention exactly when the client sync window drops it (age = window %i)',
    (d) => {
      const firedAt = now - FEED_SYNC_WINDOW_MS - d;
      const inWindow = rowsWithinSyncWindow([{ firedAt }], now).length === 1;
      expect(isPastRetention(firedAt, now)).toBe(!inWindow);
      expect(isPurgeableFeedRow(firedAt, now)).toBe(!inWindow);
      expect(firedAt < feedPurgeCutoff(now)).toBe(!inWindow);
    }
  );
});

describe('Scheduled Push rows', () => {
  it('a client ProjectionRow is a valid upload row, and the stored row adds only the Character and device', () => {
    // The client narrows `eventId` to its ProjectableEventId union; the
    // server accepts any string, so compare every other field and require
    // the client row to be assignable.
    expectTypeOf<Omit<ProjectionRow, 'characterId' | 'eventId'>>().toEqualTypeOf<
      Readonly<Omit<ProjectionRowInput, 'eventId'>>
    >();
    expectTypeOf<ProjectionRow>().toMatchTypeOf<ProjectionRowInput>();
    expectTypeOf<StoredProjectionRow>().toMatchTypeOf<ProjectionRowInput>();
  });

  it('isDue is inclusive at fireAt', () => {
    expect(isDue({ fireAt: 100 }, 100)).toBe(true);
    expect(isDue({ fireAt: 101 }, 100)).toBe(false);
  });
});

describe('contracts and Workbench fits', () => {
  it('PLEX_TYPE_ID is the same type id', () => {
    // publicContracts.ts pulls in `csv-parse`, which root cannot resolve, so
    // read its (unexported) constant from the source instead of importing it.
    const source = readFileSync(
      new URL('../functions/src/publicContracts.ts', import.meta.url),
      'utf-8'
    );
    expect(Number(/const PLEX_TYPE_ID = (\d+);/.exec(source)?.[1])).toBe(PLEX_TYPE_ID);
  });

  it.each([626, 11_567, 0])(
    'the client reads the object the writer publishes for hull %i',
    (id) => {
      expect(workbenchFitsUrl(id)).toMatch(new RegExp(`^https://[^/]+/${workbenchFitsR2Key(id)}$`));
    }
  );
});
