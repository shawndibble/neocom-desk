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
import { isFiniteNumber, isPlainRecord, isRecord } from '@/engine/guards';
import {
  isFiniteNumber as functionsIsFiniteNumber,
  isPlainRecord as functionsIsPlainRecord,
  isRecord as functionsIsRecord,
} from '../functions/src/guards';
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
  serverEventOccurrenceKey,
  type ServerEventFire as FunctionsServerEventFire,
  type ServerEventInputs as FunctionsServerEventInputs,
} from '../functions/src/serverEvents';
import {
  buildMailPush,
  mailOccurrenceKey,
  selectNewMail,
  type NewMailFire as FunctionsNewMailFire,
} from '../functions/src/mailPush';
import {
  NEARBY_EVENT_IDS,
  occurrenceKeyOf as nearbyOccurrenceKey,
  type NearbyFire as FunctionsNearbyFire,
} from '../functions/src/nearbyAlerts';
import { occurrenceFiredAt, occurrenceKey } from '@/engine/occurrenceKey';
import {
  diffNewMail,
  diffPriceAlertTriggered,
  type PriceAlertEntrySnapshot,
} from '@/engine/notificationDiffs';
import {
  SERVER_PUSHED_EVENT_IDS,
  type ServerEventInputs as ClientServerEventInputs,
} from '@/features/notifications/serverEvents';
import {
  parseServerEventFire,
  type ServerEventFire as ClientServerEventFire,
} from '@/features/notifications/serverEventPayload';

describe('type guards', () => {
  const values: unknown[] = [
    {},
    { a: 1 },
    Object.create(null),
    [],
    [1],
    new Date(0),
    null,
    undefined,
    0,
    1,
    -1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '1',
    '',
    true,
    () => {},
  ];

  it.each([
    ['isRecord', isRecord, functionsIsRecord],
    ['isPlainRecord', isPlainRecord, functionsIsPlainRecord],
    ['isFiniteNumber', isFiniteNumber, functionsIsFiniteNumber],
  ])('%s narrows the same values on both sides', (_, client, server) => {
    expect(values.map(server)).toEqual(values.map(client));
  });
});

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
    expect(
      [...COMMUNITY_EVENT_IDS, ...POLLED_EVENT_IDS, ...NEARBY_EVENT_IDS, 'newMail'].sort()
    ).toEqual([...SERVER_PUSHED_EVENT_IDS].sort());
  });

  it('the server builds the fires the service worker parses', () => {
    expectTypeOf<
      FunctionsServerEventFire | FunctionsNearbyFire | FunctionsNewMailFire
    >().toEqualTypeOf<ClientServerEventFire>();
    expectTypeOf<FunctionsServerEventInputs>().toEqualTypeOf<ClientServerEventInputs>();
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
  ];

  it.each(fires.map((fire) => [fire.eventId, fire] as const))(
    '%s: the push is keyed like the Foreground Poller’s row',
    (_, fire) => {
      const now = 50_000;
      expect(serverEventOccurrenceKey(fire)).toBe(occurrenceKey(fire, now));
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
});

describe('server-pushed nearby alerts (issue #5122)', () => {
  const fires: FunctionsNearbyFire[] = [
    {
      eventId: 'incursionNearby',
      characterId: 7,
      constellationId: 20000020,
      stagingSystemId: 30000144,
      state: 'established',
      jumps: 1,
    },
    {
      eventId: 'skyhookRaidableNearby',
      characterId: 7,
      systemId: 30000142,
      planetId: 40009077,
      startMs: 1_700_000_000_000,
      endMs: 1_700_000_360_000,
      jumps: 3,
    },
  ];
  it.each(fires.map((fire) => [fire.eventId, fire] as const))(
    '%s: the push is keyed like the Foreground Poller’s row',
    (_, fire) => {
      expect(nearbyOccurrenceKey(fire)).toBe(occurrenceKey(fire, 50_000));
    }
  );
});

describe('server-pushed new mail (issue #5143)', () => {
  const header = (mailId: number, fromId: number | undefined, sentMs: number) => ({
    mailId,
    ...(fromId === undefined ? {} : { fromId }),
    sentMs,
    subject: `Subject ${mailId}`,
  });
  const headers = [
    header(120, 900, 1_000),
    header(110, 7, 2_000),
    header(105, 901, 3_000),
    header(90, 902, 4_000),
    header(130, undefined, 5_000),
  ];

  it('fires for the same mail ids as diffNewMail: above the mark, never the Character’s own', () => {
    const snapshot = (entries: typeof headers) => ({
      entries: entries.map(({ mailId, sentMs, fromId }) => ({
        mailId,
        sentMs,
        ...(fromId === undefined ? {} : { fromId }),
      })),
      nowMs: 0,
    });
    for (const mark of [0, 90, 105, 119, 130]) {
      const server = selectNewMail(7, mark, headers).fires;
      const client = diffNewMail(7, snapshot([header(mark, 1, 0)]), snapshot(headers));
      expect(server.map((f) => f.mailId).sort()).toEqual(client.map((f) => f.mailId).sort());
    }
  });

  it('seeds silently like a missing baseline, at the highest id', () => {
    const snapshot = { entries: headers.map(({ mailId }) => ({ mailId })), nowMs: 0 };
    expect(diffNewMail(7, undefined, snapshot)).toEqual([]);
    expect(selectNewMail(7, null, headers)).toMatchObject({ fires: [], highWaterId: 130 });
  });

  it('the push is keyed and dated like the Foreground Poller’s row, and carries a fire the worker parses', () => {
    const [fire] = selectNewMail(7, 100, [header(120, 900, 1_000)]).fires;
    expect(mailOccurrenceKey(fire)).toBe(occurrenceKey(fire, 50_000));
    const { data } = buildMailPush(fire, 50_000);
    expect(data.occurrenceKey).toBe(occurrenceKey(fire, 50_000));
    expect(Number(data.fireAt)).toBe(occurrenceFiredAt(fire, 50_000));
    expect(parseServerEventFire('newMail', 7, data.fire)).toEqual(fire);
  });
});
