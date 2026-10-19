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
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { TRADE_HUBS } from '@/market/hubs';
import { fetchAggregates, FUZZWORK_AGGREGATES_URL } from '@/market/fuzzwork';
import { eveToday, shiftDate } from '@/engine/miningTax/yieldRange';
import {
  BACKFILL_HUB,
  FUZZWORK_AGGREGATES_URL as FN_FUZZWORK_URL,
  FUZZWORK_TYPE_CHUNK_SIZE,
  SNAPSHOT_HUBS,
  parseFuzzworkAggregates,
  shiftDateString,
  utcDateString,
} from '../functions/src/marketSnapshot';
import { MARKET_OPEN_PRICES_REGION_IDS } from '../functions/src/marketOpenPrices';
import {
  FIRED_RETENTION_MS,
  isDue,
  isPastRetention,
  type StoredProjectionRow,
} from '../functions/src/dispatchProjections';
import type { ProjectionRowInput } from '../functions/src/registerDevice';
import { feedPurgeCutoff, isPurgeableFeedRow } from '../functions/src/purgeFeed';
import { hullPartCount } from '../functions/src/workbenchFits';
import { FEED_SYNC_WINDOW_MS, rowsWithinSyncWindow } from '@/features/notifications/feed';
import { PLEX_TYPE_ID } from '@/engine/contracts/contractOffers';
import type { ProjectionRow } from '@/engine/projection';
import { workbenchPartCount } from '@/features/fittings/workbenchFits';

describe('trade hubs', () => {
  it('SNAPSHOT_HUBS matches TRADE_HUBS ids, stations and regions, in order', () => {
    expect(SNAPSHOT_HUBS.map((h) => ({ ...h }))).toEqual(
      TRADE_HUBS.map((h) => ({ id: h.id, stationId: h.stationId, regionId: h.regionId }))
    );
  });

  it('BACKFILL_HUB is the first (default) hub', () => {
    expect(BACKFILL_HUB.id).toBe(TRADE_HUBS[0].id);
  });

  it('MARKET_OPEN_PRICES_REGION_IDS is exactly the hub regions', () => {
    expect([...MARKET_OPEN_PRICES_REGION_IDS].sort()).toEqual(
      TRADE_HUBS.map((h) => h.regionId).sort()
    );
  });
});

describe('date helpers', () => {
  const cases: [string, number][] = [
    ['2026-09-25', 0],
    ['2026-09-25', 1],
    ['2026-09-25', -1],
    ['2026-09-30', 1],
    ['2026-10-01', -1],
    ['2026-12-31', 1],
    ['2027-01-01', -1],
    ['2024-02-28', 1],
    ['2024-02-29', 1],
    ['2025-02-28', 1],
    ['2026-03-01', -90],
    ['2026-09-25', 365],
    ['2026-09-25', -400],
  ];

  it.each(cases)('shiftDateString(%s, %i) equals shiftDate', (date, days) => {
    expect(shiftDateString(date, days)).toBe(shiftDate(date, days));
  });

  it.each([
    new Date('2026-09-25T00:00:00Z'),
    new Date('2026-09-25T23:59:59.999Z'),
    new Date('2026-12-31T23:59:59Z'),
    new Date('2024-02-29T12:00:00Z'),
  ])('utcDateString(%s) equals eveToday', (now) => {
    expect(utcDateString(now)).toBe(eveToday(now));
  });
});

describe('Fuzzwork', () => {
  afterEach(() => vi.unstubAllGlobals());

  const body = {
    '34': {
      buy: { max: '5.5', min: '1', volume: '100', orderCount: '10' },
      sell: { min: '6.25', max: '9', volume: '50', orderCount: '4' },
    },
    // Orders counted but malformed / zero / negative prices.
    '35': {
      buy: { max: 'abc', orderCount: '3' },
      sell: { min: '0', orderCount: '3' },
    },
    '36': {
      buy: { max: '-2', orderCount: '3' },
      sell: { min: undefined, orderCount: '3' },
    },
    // No orders on a side.
    '37': {
      buy: { max: '7', orderCount: '0' },
      sell: { min: '8', orderCount: 'NaN' },
    },
    // Numeric (not string) fields.
    '38': {
      buy: { max: 3, orderCount: 1 },
      sell: { min: 4, orderCount: 1 },
    },
    // Missing sides / missing entry (39 absent entirely, 40 empty).
    '40': {},
  };
  const typeIds = [34, 35, 36, 37, 38, 39, 40];

  it('buy/sell prices parse identically', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body)))
    );
    const client = await fetchAggregates(60003760, typeIds);
    const fn = parseFuzzworkAggregates(body, typeIds);

    expect([...fn.keys()]).toEqual([...client.keys()]);
    for (const id of typeIds) {
      expect(fn.get(id), `type ${id}`).toEqual({
        buy: client.get(id)!.buyMax,
        sell: client.get(id)!.sellMin,
      });
    }
  });

  it('missing/empty body parses to all-null on both sides', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}'))
    );
    const client = await fetchAggregates(60003760, [34]);
    expect(parseFuzzworkAggregates(null, [34]).get(34)).toEqual({
      buy: client.get(34)!.buyMax,
      sell: client.get(34)!.sellMin,
    });
  });

  it('shares the endpoint URL and the 200-type chunk size', async () => {
    expect(FN_FUZZWORK_URL).toBe(FUZZWORK_AGGREGATES_URL);
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    const ids = Array.from({ length: FUZZWORK_TYPE_CHUNK_SIZE + 1 }, (_, i) => i + 1);
    await fetchAggregates(60003760, ids);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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

  it.each([
    undefined,
    null,
    'x',
    {},
    { parts: 0 },
    { parts: -1 },
    { parts: 1.5 },
    { parts: '3' },
    { parts: 1 },
    { parts: 4 },
  ])('hullPartCount(%j) equals workbenchPartCount', (part0) => {
    expect(hullPartCount(part0)).toBe(workbenchPartCount(part0));
  });
});
