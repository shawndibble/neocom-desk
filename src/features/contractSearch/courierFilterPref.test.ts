import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  useCourierFilterPref,
  parseStoredCourierFilter,
  COURIER_FILTER_SETTING_KEY,
  DEFAULT_COURIER_FILTER,
  type StoredCourierFilter,
} from './courierFilterPref';

const NARROWED: StoredCourierFilter = {
  originRegionId: 10000002,
  destinationRegionId: 10000043,
  destinationSpace: ['highsec', 'lowsec'],
  hideUncompletable: true,
  overRate: 'hide',
  minReward: '1000000',
  maxCollateral: '50000000',
  maxVolume: '5000',
  minDays: '2',
};

beforeEach(async () => {
  await db.settings.clear();
  useCourierFilterPref.setState({ value: DEFAULT_COURIER_FILTER, hydrated: false });
});

describe('parseStoredCourierFilter', () => {
  it('accepts a complete, valid record', () => {
    expect(parseStoredCourierFilter({ ...NARROWED })).toEqual(NARROWED);
  });

  it('rejects an unknown space kind', () => {
    expect(
      parseStoredCourierFilter({ ...NARROWED, destinationSpace: ['highsec', 'deep-space'] })
    ).toBeNull();
  });

  it('rejects an unknown overRate value', () => {
    expect(parseStoredCourierFilter({ ...NARROWED, overRate: 'flagged' })).toBeNull();
  });

  it('rejects a non-string numeric field', () => {
    expect(parseStoredCourierFilter({ ...NARROWED, maxCollateral: 50000000 })).toBeNull();
  });

  /**
   * Whole-record reject, not a per-field merge: a filter that restores every
   * field but one is a filter the hauler never actually set.
   */
  it('rejects the whole record when only one field is bad', () => {
    expect(parseStoredCourierFilter({ ...NARROWED, hideUncompletable: 'yes' })).toBeNull();
  });

  it('rejects values that are not records at all', () => {
    expect(parseStoredCourierFilter(null)).toBeNull();
    expect(parseStoredCourierFilter('courier')).toBeNull();
    expect(parseStoredCourierFilter([NARROWED])).toBeNull();
  });
});

describe('useCourierFilterPref', () => {
  it('defaults to no restriction at all', () => {
    expect(useCourierFilterPref.getState().value).toEqual(DEFAULT_COURIER_FILTER);
    expect(useCourierFilterPref.getState().hydrated).toBe(false);
  });

  it('persists every field under one contractSearchCourierFilter key', async () => {
    await useCourierFilterPref.getState().setValue({ ...NARROWED });
    expect((await db.settings.get(COURIER_FILTER_SETTING_KEY))?.value).toEqual(NARROWED);
  });

  it('applies a persisted record on hydrate', async () => {
    await db.settings.put({ key: COURIER_FILTER_SETTING_KEY, value: { ...NARROWED } });
    await useCourierFilterPref.getState().hydrate();
    expect(useCourierFilterPref.getState().value).toEqual(NARROWED);
  });

  it('falls back to every default when the stored record is malformed', async () => {
    await db.settings.put({ key: COURIER_FILTER_SETTING_KEY, value: { overRate: 'bogus' } });
    await useCourierFilterPref.getState().hydrate();
    expect(useCourierFilterPref.getState().value).toEqual(DEFAULT_COURIER_FILTER);
  });
});
