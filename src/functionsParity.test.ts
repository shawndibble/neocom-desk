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
import {
  BUYBACK_GROUP_KEYS,
  MAX_BUY_LINES,
  MAX_RATE,
  MIN_RATE,
  RATE_BASES,
  isValidRate,
} from '@/engine/communities/buyback';
import {
  BUYBACK_GROUP_KEYS as FUNCTIONS_GROUP_KEYS,
  BUYBACK_HUB_IDS,
  MAX_BUY_LINES as FUNCTIONS_MAX_BUY_LINES,
  MAX_RATE as FUNCTIONS_MAX_RATE,
  MIN_RATE as FUNCTIONS_MIN_RATE,
  RATE_BASES as FUNCTIONS_RATE_BASES,
  isValidRate as functionsIsValidRate,
} from '../functions/src/buybackTerms';
import {
  COMMUNITY_EVENT_IDS,
  POLLED_EVENT_IDS,
  diffPriceAlerts,
  diffShipLosses,
  serverEventFiredAt,
  serverEventOccurrenceKey,
  type ServerEventFire as FunctionsServerEventFire,
} from '../functions/src/serverEvents';
import { occurrenceFiredAt, occurrenceKey } from '@/engine/occurrenceKey';
import {
  diffPriceAlertTriggered,
  diffShipLost,
  type PriceAlertEntrySnapshot,
} from '@/engine/notificationDiffs';
import { SERVER_PUSHED_EVENT_IDS } from '@/features/notifications/serverEvents';
import type { ServerEventFire as ClientServerEventFire } from '@/features/notifications/serverEventPayload';

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

describe('standing buyback Requests', () => {
  it('the callable names the same groups, hubs and rate bounds as the engine', () => {
    expect([...FUNCTIONS_GROUP_KEYS]).toEqual(BUYBACK_GROUP_KEYS);
    expect([...BUYBACK_HUB_IDS]).toEqual(TRADE_HUBS.map((h) => h.id));
    expect([FUNCTIONS_MIN_RATE, FUNCTIONS_MAX_RATE]).toEqual([MIN_RATE, MAX_RATE]);
    expect([...FUNCTIONS_RATE_BASES]).toEqual([...RATE_BASES]);
    expect(FUNCTIONS_MAX_BUY_LINES).toBe(MAX_BUY_LINES);
  });

  it('the callable and the engine agree on which rates are valid', () => {
    for (const rate of [0, 0.9, 1, 92.5, 92.55, 100, 200, 200.1, Number.NaN, '90']) {
      expect(functionsIsValidRate(rate)).toBe(isValidRate(rate));
    }
  });
});

describe('server-pushed events (issue #5121)', () => {
  it('the server handles exactly the events the client registers for', () => {
    expect([...COMMUNITY_EVENT_IDS, ...POLLED_EVENT_IDS].sort()).toEqual(
      [...SERVER_PUSHED_EVENT_IDS].sort()
    );
  });

  it('the server builds the fires the service worker parses', () => {
    expectTypeOf<FunctionsServerEventFire>().toEqualTypeOf<ClientServerEventFire>();
  });

  const fires: FunctionsServerEventFire[] = [
    {
      eventId: 'communityJoinRequest',
      characterId: 7,
      communityId: 'c1',
      communityName: 'Wing',
      uid: 'char:9',
      characterName: 'Nine',
      at: 1000,
    },
    {
      eventId: 'communityMemberJoined',
      characterId: 7,
      communityId: 'c1',
      communityName: 'Wing',
      uid: 'char:9',
      characterName: 'Nine',
      at: 2000,
    },
    {
      eventId: 'communityRequestPledged',
      characterId: 5,
      communityId: 'c1',
      communityName: 'Wing',
      uid: 'char:9',
      characterName: '',
      requestId: 'r1',
      requestLabel: 'Rifter',
      count: 1,
      at: 3000,
    },
    {
      eventId: 'priceAlertTriggered',
      characterId: 7,
      typeId: 34,
      name: 'Tritanium',
      price: 4.5,
      targetPrice: 5.25,
      direction: 'below',
    },
    { eventId: 'shipLost', characterId: 7, killmailId: 55, timeMs: 9_000, value: 1.5e6 },
    { eventId: 'shipLost', characterId: 7, killmailId: 56, timeMs: 99_000 },
  ];

  it.each(fires.map((fire) => [fire.eventId, fire] as const))(
    '%s: the push is keyed and dated like the Foreground Poller’s row',
    (_, fire) => {
      const now = 50_000;
      expect(serverEventOccurrenceKey(fire)).toBe(occurrenceKey(fire, now));
      expect(serverEventFiredAt(fire, now)).toBe(occurrenceFiredAt(fire, now));
    }
  );

  it('price alerts fire on the same crossings', () => {
    const entry = (
      price: number | null,
      targetPrice = 10,
      direction: 'above' | 'below' = 'above'
    ): PriceAlertEntrySnapshot => ({ typeId: 34, name: 'T', targetPrice, direction, price });
    const cases: [PriceAlertEntrySnapshot[] | undefined, PriceAlertEntrySnapshot[]][] = [
      [undefined, [entry(11)]],
      [[entry(9)], [entry(11)]],
      [[entry(11)], [entry(12)]],
      [[entry(11, 10)], [entry(11, 9)]],
      [[entry(11)], [entry(11, 10, 'below')]],
      [[entry(null)], [entry(10)]],
      [[], [entry(10)]],
      [[entry(9)], [entry(null)]],
    ];
    for (const [prev, next] of cases) {
      expect(diffPriceAlerts(7, prev, next)).toEqual(
        diffPriceAlertTriggered(7, prev && { entries: prev, nowMs: 0 }, { entries: next, nowMs: 0 })
      );
    }
  });

  it('ship losses fire for the same killmails, against the same minimum', () => {
    const losses = [
      { killmailId: 3, timeMs: 3, value: 50 },
      { killmailId: 2, timeMs: 2 },
      { killmailId: 1, timeMs: 1, value: 5, shipTypeId: 587, systemId: 30000142 },
    ];
    for (const minimum of [0, 10]) {
      for (const seen of [undefined, [], [1], [1, 2, 3]]) {
        const snapshot = (entries: typeof losses) => ({
          entries: entries.map((entry) => ({ ...entry, thresholdIsk: minimum })),
          nowMs: 0,
        });
        expect(diffShipLosses(7, seen, losses, minimum)).toEqual(
          diffShipLost(
            7,
            seen && snapshot(losses.filter((l) => seen.includes(l.killmailId))),
            snapshot(losses)
          )
        );
      }
    }
  });
});
