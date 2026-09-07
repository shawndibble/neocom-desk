import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  DEFAULT_EXPIRING_WINDOW_HOURS,
  EXPIRING_WINDOW_HOUR_OPTIONS,
  PI_EXPIRING_WINDOW_SETTING_KEY,
  useExpiringWindowHours,
} from './expiringWindow';
import { colonyAttention, extractorState } from '@/engine/pi/colonyStatus';

const HOUR_MS = 3_600_000;
const NOW = Date.parse('2026-09-07T00:00:00Z');

beforeEach(async () => {
  await db.settings.clear();
  useExpiringWindowHours.setState({ value: DEFAULT_EXPIRING_WINDOW_HOURS, hydrated: false });
});

async function hydrated(): Promise<number> {
  await useExpiringWindowHours.getState().hydrate();
  return useExpiringWindowHours.getState().value;
}

describe('EXPIRING_WINDOW_HOUR_OPTIONS', () => {
  it('offers only windows shorter than a program a pilot would actually install', () => {
    // Efficient play installs well under two days (`engine/pi/extraction.ts`:
    // three-day resets yield 2.46x a single 14-day program). An option at or
    // past the program's own length is lit from install — see below for what
    // that costs.
    expect(Math.max(...EXPIRING_WINDOW_HOUR_OPTIONS)).toBeLessThanOrEqual(24);
    expect(EXPIRING_WINDOW_HOUR_OPTIONS).toEqual([1, 6, 12, 24]);
  });

  it('keeps the default among the options', () => {
    expect(EXPIRING_WINDOW_HOUR_OPTIONS).toContain(DEFAULT_EXPIRING_WINDOW_HOURS);
  });

  it('leaves a 48-hour program un-flagged at install on every option', () => {
    // The property the list exists to guarantee. A window >= the program's
    // length makes `extractorState` say `expiring-soon` for its whole life.
    const programMs = 48 * HOUR_MS;
    for (const hours of EXPIRING_WINDOW_HOUR_OPTIONS) {
      expect(extractorState(NOW + programMs, NOW, hours * HOUR_MS)).toBe('active');
    }
  });

  it('still lets a decayed colony report as decayed', () => {
    // `colonyAttention` tests expiring-soon before decayed, so an over-long
    // window makes the reset-cadence nudge unreachable. A 48h program half
    // spent is 24h out — the boundary of the widest option — so this is the
    // tightest case that must still resolve to `decayed`.
    const status = { idle: false, soonestExpiryMs: NOW + 25 * HOUR_MS, decayed: true };
    for (const hours of EXPIRING_WINDOW_HOUR_OPTIONS) {
      expect(colonyAttention(status, NOW, hours * HOUR_MS)).toBe('decayed');
    }
  });
});

describe('useExpiringWindowHours', () => {
  it('defaults to 24 hours, unchanged from before it was settable', async () => {
    expect(await hydrated()).toBe(24);
  });

  it('round-trips every offered option', async () => {
    for (const hours of EXPIRING_WINDOW_HOUR_OPTIONS) {
      await db.settings.put({ key: PI_EXPIRING_WINDOW_SETTING_KEY, value: hours });
      useExpiringWindowHours.setState({ hydrated: false });
      expect(await hydrated()).toBe(hours);
    }
  });

  it('falls back to the default for a window this build no longer offers', async () => {
    // 48 was offered before; a pilot who picked it must not keep a value the
    // control cannot show them, and cannot un-pick.
    await db.settings.put({ key: PI_EXPIRING_WINDOW_SETTING_KEY, value: 48 });
    expect(await hydrated()).toBe(DEFAULT_EXPIRING_WINDOW_HOURS);
  });

  it.each([
    ['a string', '24'],
    ['null', null],
    ['zero', 0],
  ])('falls back to the default for %s', async (_label, stored) => {
    await db.settings.put({ key: PI_EXPIRING_WINDOW_SETTING_KEY, value: stored });
    expect(await hydrated()).toBe(DEFAULT_EXPIRING_WINDOW_HOURS);
  });
});
