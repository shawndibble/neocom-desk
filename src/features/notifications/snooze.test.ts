import { describe, expect, it } from 'vitest';
import {
  SNOOZE_MS,
  isSnoozed,
  parseSnoozeMap,
  pruneExpired,
  snooze,
  withoutSnoozed,
} from './snooze';

const NOW = 1_000_000;

describe('snooze', () => {
  it('adds an hour to now by default and keeps the other groups', () => {
    expect(SNOOZE_MS).toBe(60 * 60 * 1000);
    expect(snooze({ 'event:a': 5 }, 'event:b', NOW)).toEqual({
      'event:a': 5,
      'event:b': NOW + SNOOZE_MS,
    });
  });

  it('takes an explicit duration', () => {
    expect(snooze({}, 'event:a', NOW, 10)).toEqual({ 'event:a': NOW + 10 });
  });
});

describe('isSnoozed', () => {
  it('is true strictly before the deadline', () => {
    const map = { 'event:a': NOW + 1 };
    expect(isSnoozed(map, 'event:a', NOW)).toBe(true);
    expect(isSnoozed(map, 'event:a', NOW + 1)).toBe(false);
    expect(isSnoozed(map, 'event:b', NOW)).toBe(false);
  });
});

describe('pruneExpired', () => {
  it('drops expired groups', () => {
    expect(pruneExpired({ 'event:a': NOW - 1, 'event:b': NOW + 1 }, NOW)).toEqual({
      'event:b': NOW + 1,
    });
  });
});

describe('withoutSnoozed', () => {
  it('removes entries whose group is snoozed', () => {
    const rows = [
      { id: '1', eventId: 'priceAlertTriggered' },
      { id: '2', eventId: 'newMail' },
    ];
    const map = { 'event:priceAlertTriggered': NOW + 1 };
    expect(withoutSnoozed(rows, map, NOW).map((r) => r.id)).toEqual(['2']);
    expect(withoutSnoozed(rows, {}, NOW)).toHaveLength(2);
  });
});

describe('parseSnoozeMap', () => {
  it('keeps numeric values and rejects garbage', () => {
    expect(parseSnoozeMap({ a: 5, b: 'x', c: Number.NaN })).toEqual({ a: 5 });
    expect(parseSnoozeMap(null)).toBeNull();
    expect(parseSnoozeMap([1])).toBeNull();
  });
});
