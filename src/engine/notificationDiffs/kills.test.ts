import { describe, it, expect } from 'vitest';
import {
  diffShipLost,
  type ShipLossEntrySnapshot,
  type ShipLostFire,
  type ShipLossSnapshot,
} from './index';

const T0 = 1_000_000;

function loss(killmailId: number, overrides: Partial<ShipLossEntrySnapshot> = {}) {
  return { killmailId, timeMs: T0 + killmailId, thresholdIsk: 0, ...overrides };
}

function snapshot(entries: readonly ShipLossEntrySnapshot[]): ShipLossSnapshot {
  return { entries, nowMs: T0 };
}

describe('diffShipLost', () => {
  it('fires nothing without a baseline, so enabling the event stays quiet about old losses', () => {
    expect(diffShipLost(7, undefined, snapshot([loss(1), loss(2)]))).toEqual([]);
  });

  it('fires nothing when no loss is new', () => {
    const entries = [loss(1), loss(2)];
    expect(diffShipLost(7, snapshot(entries), snapshot(entries))).toEqual([]);
  });

  it('fires once per loss id missing from the baseline, oldest first', () => {
    const prev = snapshot([loss(1)]);
    const next = snapshot([
      loss(3, { shipTypeId: 587, systemId: 30002782, value: 12_400_000 }),
      loss(2),
      loss(1),
    ]);
    const fires: ShipLostFire[] = [
      { eventId: 'shipLost', characterId: 7, killmailId: 2, timeMs: T0 + 2 },
      {
        eventId: 'shipLost',
        characterId: 7,
        killmailId: 3,
        timeMs: T0 + 3,
        shipTypeId: 587,
        systemId: 30002782,
        value: 12_400_000,
      },
    ];
    expect(diffShipLost(7, prev, next)).toEqual(fires);
  });

  it('fires for the first loss of a pilot whose baseline held none', () => {
    expect(diffShipLost(7, snapshot([]), snapshot([loss(5)]))).toHaveLength(1);
  });

  it('skips a loss under the minimum ISK, and one with no value once a minimum is set', () => {
    const prev = snapshot([]);
    const next = snapshot([
      loss(1, { value: 4_000_000, thresholdIsk: 5_000_000 }),
      loss(2, { value: 5_000_000, thresholdIsk: 5_000_000 }),
      loss(3, { thresholdIsk: 5_000_000 }),
    ]);
    expect(diffShipLost(7, prev, next).map((fire) => fire.killmailId)).toEqual([2]);
  });

  it('keeps a loss with no value when there is no minimum', () => {
    expect(diffShipLost(7, snapshot([]), snapshot([loss(1)]))).toHaveLength(1);
  });
});
