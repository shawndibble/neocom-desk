import { describe, expect, it } from 'vitest';
import {
  MAX_PRICE_ALERTS,
  MAX_SERVER_EVENTS,
  buildServerEventPush,
  diffPriceAlerts,
  parseServerEvents,
  parseServerInputs,
  polledEventsOf,
  serverEventOccurrenceKey,
  trimBaseline,
  type PriceAlertSnapshotEntry,
  type ServerEventFire,
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

  it('parses price alerts, ignoring unknown keys and the retired ship-lost minimum', () => {
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
    // A client from before the retirement may still send it, bad or not.
    expect(parseServerInputs({ shipLostMinimumIsk: -1 }, 'x')).toEqual({});
  });
});

describe('polledEventsOf', () => {
  it('lists the scheduled events a device needs polled, once each', () => {
    expect(
      polledEventsOf({
        '1': ['communityJoinRequest', 'shipLost'],
        '2': ['priceAlertTriggered', 'shipLost'],
      })
    ).toEqual(['priceAlertTriggered']);
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
    ];
    for (const [fire, key] of fires) expect(serverEventOccurrenceKey(fire)).toBe(key);
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

  it('words a price alert for the floor, dated now', () => {
    const data = buildServerEventPush(
      {
        eventId: 'priceAlertTriggered',
        characterId: 7,
        typeId: 34,
        name: 'Tritanium',
        price: 11,
        targetPrice: 10,
        direction: 'above',
      },
      2
    );
    expect(data.title).toBe('Price alert');
    expect(data.body).toBe('Tritanium reached 11.00 ISK (target 10.00 ISK).');
    expect(data.fireAt).toBe('2');
  });
});

describe('trimBaseline', () => {
  it('keeps only the readings of events still enabled', () => {
    // A stored loss reading from before ship losses left the server is dropped.
    const stored = { priceAlerts: [entry(1)], shipLossIds: [1, 'x'] };
    expect(trimBaseline(stored, ['shipLost'])).toEqual({});
    expect(trimBaseline(stored, ['priceAlertTriggered'])).toEqual({ priceAlerts: [entry(1)] });
    expect(trimBaseline('junk', ['priceAlertTriggered'])).toEqual({});
  });
});
