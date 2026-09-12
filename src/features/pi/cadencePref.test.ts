import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  useCadence,
  parsePiCadence,
  cadenceHours,
  PI_CADENCE_KEY,
  PI_CADENCE_DAYS,
  DEFAULT_PI_CADENCE,
} from './cadencePref';

const WEEKLY_HAUL = { restartDays: 3, haulDays: 7 } as const;

beforeEach(async () => {
  await db.settings.clear();
  useCadence.setState({ value: DEFAULT_PI_CADENCE, hydrated: false });
});

describe('parsePiCadence', () => {
  it('accepts a complete, valid record', () => {
    expect(parsePiCadence({ ...WEEKLY_HAUL })).toEqual(WEEKLY_HAUL);
  });

  it('accepts every offered cadence on both axes', () => {
    for (const days of PI_CADENCE_DAYS) {
      expect(parsePiCadence({ restartDays: days, haulDays: days })).toEqual({
        restartDays: days,
        haulDays: days,
      });
    }
  });

  /**
   * The two axes are independent on purpose: restarting an extractor does not
   * empty the Launchpad, and hauling does not reinstall a program. A parser
   * that quietly tied them together would erase the distinction the whole
   * preference exists to draw.
   */
  it('accepts a haul cadence longer than the restart cadence, and the reverse', () => {
    expect(parsePiCadence({ restartDays: 1, haulDays: 14 })).toEqual({
      restartDays: 1,
      haulDays: 14,
    });
    expect(parsePiCadence({ restartDays: 14, haulDays: 1 })).toEqual({
      restartDays: 14,
      haulDays: 1,
    });
  });

  /**
   * A day count outside the offered set is not rounded to the nearest one.
   * The set mirrors the cadences the in-game extractor UI is shaped around,
   * and silently snapping 5 to 7 would price a plan the pilot never chose.
   */
  it('rejects a day count outside the offered set', () => {
    expect(parsePiCadence({ ...WEEKLY_HAUL, restartDays: 5 })).toBeNull();
    expect(parsePiCadence({ ...WEEKLY_HAUL, haulDays: 0 })).toBeNull();
    expect(parsePiCadence({ ...WEEKLY_HAUL, haulDays: 30 })).toBeNull();
  });

  it('rejects a non-integer or non-numeric day count', () => {
    expect(parsePiCadence({ ...WEEKLY_HAUL, restartDays: 3.5 })).toBeNull();
    expect(parsePiCadence({ ...WEEKLY_HAUL, restartDays: '3' })).toBeNull();
    expect(parsePiCadence({ ...WEEKLY_HAUL, haulDays: Number.NaN })).toBeNull();
  });

  it('rejects a record missing either axis', () => {
    expect(parsePiCadence({ restartDays: 3 })).toBeNull();
    expect(parsePiCadence({ haulDays: 7 })).toBeNull();
  });

  it('rejects anything that is not a plain object', () => {
    expect(parsePiCadence(null)).toBeNull();
    expect(parsePiCadence('3')).toBeNull();
    expect(parsePiCadence([3, 7])).toBeNull();
  });

  /**
   * Whole-record reject rather than a per-field merge, matching
   * `planControlsPref`: half a restored cadence — the pilot's haul window
   * against somebody else's restart — is worse than a wholly default one,
   * because every figure on the tab is derived from the pair.
   */
  it('rejects the whole record when one field is unusable', () => {
    expect(parsePiCadence({ restartDays: 3, haulDays: 'weekly' })).toBeNull();
  });
});

describe('cadenceHours', () => {
  it('converts each axis to hours', () => {
    expect(cadenceHours({ restartDays: 3, haulDays: 7 })).toEqual({
      restartHours: 72,
      haulHours: 168,
    });
  });

  /**
   * 24 hours on both axes is what `ADVISOR_BUFFER_HOURS` hardcoded, and it is
   * the default here — so a pilot who never touches the control sees what the
   * tab showed before, rather than a silently different set of figures.
   */
  it('reproduces the old hardcoded 24-hour window at the default', () => {
    expect(cadenceHours(DEFAULT_PI_CADENCE)).toEqual({ restartHours: 24, haulHours: 24 });
  });
});

describe('useCadence', () => {
  it('round-trips a stored cadence', async () => {
    await db.settings.put({ key: PI_CADENCE_KEY, value: WEEKLY_HAUL });
    await useCadence.getState().hydrate();
    expect(useCadence.getState().value).toEqual(WEEKLY_HAUL);
  });

  it('falls back to the default when the stored record is unusable', async () => {
    await db.settings.put({ key: PI_CADENCE_KEY, value: { restartDays: 5, haulDays: 7 } });
    await useCadence.getState().hydrate();
    expect(useCadence.getState().value).toEqual(DEFAULT_PI_CADENCE);
  });
});
