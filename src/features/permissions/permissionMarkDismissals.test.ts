import { afterEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  PERMISSION_MARK_DISMISSALS_KEY,
  markStatus,
  parsePermissionMarkDismissals,
  usePermissionMarkDismissalsStore,
  withDismissed,
  withoutDismissed,
} from './permissionMarkDismissals';

afterEach(async () => {
  await usePermissionMarkDismissalsStore.getState().setValue([]);
  await db.settings.clear();
});

describe('parsePermissionMarkDismissals', () => {
  it('keeps each non-empty string once, so a Permission a newer build added survives a round trip', () => {
    expect(parsePermissionMarkDismissals(['autopilot', 'futurePermission', 'autopilot'])).toEqual([
      'autopilot',
      'futurePermission',
    ]);
  });

  it('drops anything malformed rather than the whole list', () => {
    expect(parsePermissionMarkDismissals(['autopilot', 3, '', null])).toEqual(['autopilot']);
    expect(parsePermissionMarkDismissals('autopilot')).toEqual([]);
    expect(parsePermissionMarkDismissals(undefined)).toEqual([]);
  });
});

describe('withDismissed / withoutDismissed', () => {
  it('adds and removes, returning the same list when nothing changes', () => {
    const one = withDismissed([], ['autopilot']);
    expect(one).toEqual(['autopilot']);
    expect(withDismissed(one, ['autopilot'])).toBe(one);
    expect(withoutDismissed(one, 'autopilot')).toEqual([]);
    expect(withoutDismissed(one, 'wallet')).toBe(one);
  });
});

describe('markStatus', () => {
  it('is granted when nothing is missing', () => {
    expect(markStatus([], ['autopilot'])).toEqual({ status: 'granted', asking: [] });
  });

  it('is dismissed only when every missing Permission was dismissed', () => {
    expect(markStatus(['autopilot'], ['autopilot'])).toEqual({ status: 'dismissed', asking: [] });
    expect(markStatus(['autopilot', 'characterDetails'], ['autopilot'])).toEqual({
      status: 'missing',
      asking: ['characterDetails'],
    });
  });
});

describe('the synced store', () => {
  it('writes the dismissal to the synced settings row, account-wide', async () => {
    await usePermissionMarkDismissalsStore.getState().setValue(['autopilot']);
    const row = await db.settings.get(PERMISSION_MARK_DISMISSALS_KEY);
    expect(PERMISSION_MARK_DISMISSALS_KEY.startsWith('sync.')).toBe(true);
    expect(row?.value).toEqual(['autopilot']);
  });
});
