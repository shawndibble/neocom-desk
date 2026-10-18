import { describe, it, expect } from 'vitest';
import {
  diffEveNotification,
  type EveNotificationEntrySnapshot,
  type EveNotificationSnapshot,
} from './index';

const T0 = 1_000_000;

function eveNotificationEntry(
  notificationId: number,
  overrides: Partial<EveNotificationEntrySnapshot> = {}
): EveNotificationEntrySnapshot {
  return {
    notificationId,
    type: 'BillOutOfMoneyMsg',
    senderId: 1000132,
    senderType: 'corporation',
    text: 'amount: 12345\n',
    timestamp: '2026-09-03T00:00:00Z',
    ...overrides,
  };
}

function eveNotificationSnapshot(
  entries: readonly EveNotificationEntrySnapshot[],
  nowMs: number
): EveNotificationSnapshot {
  return { entries, nowMs };
}

describe('diffEveNotification', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = eveNotificationSnapshot([eveNotificationEntry(5)], T0);
    expect(diffEveNotification(1, undefined, next)).toEqual([]);
  });

  it('fires when a notification id above the previous high-water mark appears', () => {
    const prev = eveNotificationSnapshot([eveNotificationEntry(5), eveNotificationEntry(3)], T0);
    const next = eveNotificationSnapshot(
      [eveNotificationEntry(6), eveNotificationEntry(5), eveNotificationEntry(3)],
      T0 + 2000
    );
    expect(diffEveNotification(7, prev, next)).toEqual([
      {
        eventId: 'eveNotification',
        characterId: 7,
        notificationId: 6,
        type: 'BillOutOfMoneyMsg',
        senderId: 1000132,
        senderType: 'corporation',
        text: 'amount: 12345\n',
        timestamp: '2026-09-03T00:00:00Z',
      },
    ]);
  });

  it('does not fire for an id already seen', () => {
    const prev = eveNotificationSnapshot([eveNotificationEntry(5)], T0);
    const next = eveNotificationSnapshot([eveNotificationEntry(5)], T0 + 2000);
    expect(diffEveNotification(7, prev, next)).toEqual([]);
  });

  it('does not fire for an older id newly paged into the window', () => {
    const prev = eveNotificationSnapshot([eveNotificationEntry(10)], T0);
    const next = eveNotificationSnapshot(
      [eveNotificationEntry(10), eveNotificationEntry(9), eveNotificationEntry(1)],
      T0 + 2000
    );
    expect(diffEveNotification(7, prev, next)).toEqual([]);
  });

  it('carries an unrecognised type through untouched rather than dropping or throwing (AC2)', () => {
    const prev = eveNotificationSnapshot([eveNotificationEntry(5)], T0);
    const next = eveNotificationSnapshot(
      [eveNotificationEntry(6, { type: 'SomeBrandNewMsgType6041' }), eveNotificationEntry(5)],
      T0 + 2000
    );
    expect(diffEveNotification(7, prev, next)).toEqual([
      expect.objectContaining({ notificationId: 6, type: 'SomeBrandNewMsgType6041' }),
    ]);
  });
});
