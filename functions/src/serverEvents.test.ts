import { describe, expect, it } from 'vitest';
import {
  MAX_PRICE_ALERTS,
  MAX_SERVER_EVENTS,
  buildServerEventPush,
  diffPriceAlerts,
  diffShipLosses,
  parseServerEvents,
  parseServerInputs,
  polledEventsOf,
  serverEventFiredAt,
  serverEventOccurrenceKey,
  trimBaseline,
  type PriceAlertSnapshotEntry,
  type ServerEventFire,
  type ShipLossEntry,
} from './serverEvents.js';

describe('parseServerEvents', () => {
  it('leaves an absent list absent (an older client)', () => {
    expect(parseServerEvents(undefined, 'x')).toBeUndefined();
  });

  it('sorts and de-duplicates', () => {
    expect(parseServerEvents(['shipLost', 'communityJoinRequest', 'shipLost'], 'x')).toEqual([
      'communityJoinRequest',
      'shipLost',
    ]);
  });

  it('keeps ids this server does not handle, so a newer client’s list is stored whole', () => {
    expect(parseServerEvents(['skyhookRaidableNearby'], 'x')).toEqual(['skyhookRaidableNearby']);
  });

  it('rejects a non-array, a non-string, an empty string and an oversized list', () => {
    expect(() => parseServerEvents('shipLost', 'x')).toThrow(/array/);
    expect(() => parseServerEvents([1], 'x')).toThrow(/strings/);
    expect(() => parseServerEvents([''], 'x')).toThrow(/strings/);
    expect(() =>
      parseServerEvents(
        Array.from({ length: MAX_SERVER_EVENTS + 1 }, (_, i) => `e${i}`),
        'x'
      )
    ).toThrow(/more than/);
  });
});

describe('parseServerInputs', () => {
  it('leaves an absent value absent', () => {
    expect(parseServerInputs(undefined, 'x')).toBeUndefined();
  });

  it('parses price alerts and the ship-lost minimum, ignoring unknown keys', () => {
    expect(
      parseServerInputs(
        {
          priceStationId: 60003760,
          priceAlerts: [{ typeId: 34, name: 'Tritanium', targetPrice: 5, direction: 'above' }],
          shipLostMinimumIsk: 1_000_000,
          somethingNewer: true,
        },
        'x'
      )
    ).toEqual({
      priceStationId: 60003760,
      priceAlerts: [{ typeId: 34, name: 'Tritanium', targetPrice: 5, direction: 'above' }],
      shipLostMinimumIsk: 1_000_000,
    });
  });

  it('drops a malformed alert and alerts without a station, and cuts the list to the cap, never failing the registration', () => {
    const alert = { typeId: 34, name: 'T', targetPrice: 5, direction: 'below' };
    expect(
      parseServerInputs(
        { priceStationId: 1, priceAlerts: [{ typeId: 34, name: 'T', targetPrice: 5 }, alert] },
        'x'
      )
    ).toEqual({ priceStationId: 1, priceAlerts: [alert] });
    expect(parseServerInputs({ priceAlerts: [alert] }, 'x')).toEqual({});
    expect(
      parseServerInputs(
        {
          priceStationId: 1,
          priceAlerts: Array.from({ length: MAX_PRICE_ALERTS + 1 }, () => alert),
        },
        'x'
      )?.priceAlerts
    ).toHaveLength(MAX_PRICE_ALERTS);
    expect(() => parseServerInputs({ shipLostMinimumIsk: -1 }, 'x')).toThrow(/shipLostMinimumIsk/);
  });
});

describe('polledEventsOf', () => {
  it('lists the scheduled events a device needs polled, once each', () => {
    expect(
      polledEventsOf({
        '1': ['communityJoinRequest', 'shipLost'],
        '2': ['priceAlertTriggered', 'shipLost'],
      })
    ).toEqual(['priceAlertTriggered', 'shipLost']);
    expect(polledEventsOf({ '1': ['communityJoinRequest'] })).toEqual([]);
  });
});

const entry = (
  price: number | null,
  targetPrice = 10,
  direction: 'above' | 'below' = 'above'
): PriceAlertSnapshotEntry => ({ typeId: 34, name: 'Tritanium', targetPrice, direction, price });

describe('diffPriceAlerts (mirrors diffPriceAlertTriggered)', () => {
  it('fires nothing without a baseline', () => {
    expect(diffPriceAlerts(7, undefined, [entry(11)])).toEqual([]);
  });

  it('fires on the crossing, not while it stays crossed', () => {
    expect(diffPriceAlerts(7, [entry(9)], [entry(11)])).toEqual([
      {
        eventId: 'priceAlertTriggered',
        characterId: 7,
        typeId: 34,
        name: 'Tritanium',
        price: 11,
        targetPrice: 10,
        direction: 'above',
      },
    ]);
    expect(diffPriceAlerts(7, [entry(11)], [entry(12)])).toEqual([]);
  });

  it('re-arms on an edited target and never fires without a price', () => {
    expect(diffPriceAlerts(7, [entry(11, 10)], [entry(11, 9)])).toHaveLength(1);
    expect(diffPriceAlerts(7, [entry(9)], [entry(null)])).toEqual([]);
  });

  it('reads "below" as at or under the target', () => {
    expect(diffPriceAlerts(7, [entry(11, 10, 'below')], [entry(10, 10, 'below')])).toHaveLength(1);
  });
});

const loss = (killmailId: number, value?: number): ShipLossEntry => ({
  killmailId,
  timeMs: killmailId * 1000,
  shipTypeId: 587,
  systemId: 30000142,
  ...(value === undefined ? {} : { value }),
});

describe('diffShipLosses (mirrors diffShipLost)', () => {
  it('seeds silently, then fires each unseen loss oldest first', () => {
    expect(diffShipLosses(7, undefined, [loss(2)], 0)).toEqual([]);
    expect(diffShipLosses(7, [1], [loss(3), loss(2), loss(1)], 0).map((f) => f.killmailId)).toEqual(
      [2, 3]
    );
  });

  it('drops a loss under the minimum, and one with no value while a minimum is set', () => {
    expect(diffShipLosses(7, [], [loss(2, 5), loss(3), loss(4, 50)], 10)).toEqual([
      expect.objectContaining({ killmailId: 4 }),
    ]);
  });
});

describe('serverEventOccurrenceKey', () => {
  it('derives the Foreground Poller’s keys', () => {
    const fires: [ServerEventFire, string][] = [
      [
        {
          eventId: 'communityJoinRequest',
          characterId: 7,
          communityId: 'c1',
          communityName: 'Wing',
          uid: 'char:9',
          characterName: 'Nine',
          at: 1000,
        },
        '7:communityJoinRequest:c1:char:9:1000',
      ],
      [
        {
          eventId: 'communityRequestPledged',
          characterId: 7,
          communityId: 'c1',
          communityName: 'Wing',
          uid: 'char:9',
          characterName: 'Nine',
          requestId: 'r1',
          requestLabel: 'Rifter',
          count: 1,
          at: 1000,
        },
        '7:communityRequestPledged:c1:r1:char:9:1000',
      ],
      [
        {
          eventId: 'priceAlertTriggered',
          characterId: 7,
          typeId: 34,
          name: 'Tritanium',
          price: 11,
          targetPrice: 10,
          direction: 'above',
        },
        '7:priceAlertTriggered:34:10:above',
      ],
      [{ eventId: 'shipLost', characterId: 7, killmailId: 55, timeMs: 1 }, '7:shipLost:55'],
    ];
    for (const [fire, key] of fires) expect(serverEventOccurrenceKey(fire)).toBe(key);
  });
});

describe('serverEventFiredAt', () => {
  it('dates a loss by its killmail, never in the future, and the rest by now', () => {
    expect(
      serverEventFiredAt({ eventId: 'shipLost', characterId: 7, killmailId: 1, timeMs: 5 }, 9)
    ).toBe(5);
    expect(
      serverEventFiredAt({ eventId: 'shipLost', characterId: 7, killmailId: 1, timeMs: 50 }, 9)
    ).toBe(9);
    expect(
      serverEventFiredAt(
        {
          eventId: 'priceAlertTriggered',
          characterId: 7,
          typeId: 34,
          name: 'T',
          price: 1,
          targetPrice: 1,
          direction: 'below',
        },
        9
      )
    ).toBe(9);
  });
});

describe('buildServerEventPush', () => {
  it('carries the raw fire and a plain floor title and body, every value a string', () => {
    const fire: ServerEventFire = {
      eventId: 'communityMemberJoined',
      characterId: 7,
      communityId: 'c1',
      communityName: 'Wing',
      uid: 'char:9',
      characterName: 'Nine',
      at: 1000,
    };
    const data = buildServerEventPush(fire, 2000);
    expect(data).toEqual({
      characterId: '7',
      eventId: 'communityMemberJoined',
      occurrenceKey: '7:communityMemberJoined:c1:char:9:1000',
      title: 'New member in Wing',
      body: 'Nine joined Wing.',
      fireAt: '2000',
      fire: JSON.stringify(fire),
    });
    for (const value of Object.values(data)) expect(typeof value).toBe('string');
  });

  it('never leaves a title empty', () => {
    const data = buildServerEventPush(
      { eventId: 'shipLost', characterId: 7, killmailId: 55, timeMs: 1 },
      2
    );
    expect(data.title).toBe('Ship lost');
    expect(data.body).toBe('Lost a ship');
  });
});

describe('trimBaseline', () => {
  it('keeps only the readings of events still enabled', () => {
    const stored = { priceAlerts: [entry(1)], shipLossIds: [1, 'x'] };
    expect(trimBaseline(stored, ['shipLost'])).toEqual({ shipLossIds: [1] });
    expect(trimBaseline(stored, ['priceAlertTriggered'])).toEqual({ priceAlerts: [entry(1)] });
    expect(trimBaseline('junk', ['shipLost'])).toEqual({});
  });
});
