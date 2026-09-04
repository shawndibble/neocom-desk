import { describe, it, expect } from 'vitest';
import type { NotificationEventId } from './events';
import type { NotificationPreferencesValue } from './preferences';
import {
  SYNCED_NOTIFICATION_FEED_PREFS_KEY,
  toSyncedFeedPrefs,
  withSyncedFeedPrefsApplied,
} from './syncedPreferences';
import { SYNCED_SETTING_KEYS } from '@/sync/syncedSettings';

const EVENT_A = 'skillLevelComplete' satisfies NotificationEventId;
const EVENT_B = 'newMail' satisfies NotificationEventId;

const BASE: NotificationPreferencesValue = {
  masterEnabled: true,
  perCharacter: {},
};

describe('SYNCED_NOTIFICATION_FEED_PREFS_KEY', () => {
  it('is on the synced-settings allow-list', () => {
    expect(SYNCED_SETTING_KEYS).toContain(SYNCED_NOTIFICATION_FEED_PREFS_KEY);
  });

  it('is sync.-prefixed', () => {
    expect(SYNCED_NOTIFICATION_FEED_PREFS_KEY.startsWith('sync.')).toBe(true);
  });
});

describe('toSyncedFeedPrefs', () => {
  it('extracts only the feed half of a per-channel event toggle', () => {
    const value: NotificationPreferencesValue = {
      ...BASE,
      perCharacter: { 1: { [EVENT_A]: { browser: false, feed: false } } },
    };
    expect(toSyncedFeedPrefs(value)).toEqual({
      perCharacter: { 1: { [EVENT_A]: false } },
      eveNotificationTypesByCharacter: {},
      thresholdsByCharacter: {},
    });
  });

  it('extracts a legacy bare-boolean event state as the feed value', () => {
    const value: NotificationPreferencesValue = {
      ...BASE,
      perCharacter: { 1: { [EVENT_A]: false } },
    };
    expect(toSyncedFeedPrefs(value).perCharacter).toEqual({ 1: { [EVENT_A]: false } });
  });

  it('omits an event whose feed channel was never explicitly set', () => {
    const value: NotificationPreferencesValue = {
      ...BASE,
      perCharacter: { 1: { [EVENT_A]: { browser: false } } },
    };
    expect(toSyncedFeedPrefs(value).perCharacter).toEqual({});
  });

  it('omits a character with nothing to sync entirely', () => {
    const value: NotificationPreferencesValue = {
      ...BASE,
      perCharacter: { 1: {} },
    };
    expect(toSyncedFeedPrefs(value).perCharacter).toEqual({});
  });

  it('extracts eve-type feed overrides', () => {
    const value: NotificationPreferencesValue = {
      ...BASE,
      perCharacter: {},
      eveNotificationTypesByCharacter: {
        1: { StructureDestroyed: { browser: true, feed: false } },
      },
    };
    expect(toSyncedFeedPrefs(value).eveNotificationTypesByCharacter).toEqual({
      1: { StructureDestroyed: false },
    });
  });

  it('extracts only the fields a character has set for thresholds, never undefined', () => {
    const value: NotificationPreferencesValue = {
      ...BASE,
      thresholdsByCharacter: { 1: { structureFuelLowDays: 3 } },
    };
    const synced = toSyncedFeedPrefs(value);
    expect(synced.thresholdsByCharacter).toEqual({ 1: { structureFuelLowDays: 3 } });
    expect(Object.values(synced.thresholdsByCharacter[1])).not.toContain(undefined);
  });

  it('omits a character with no thresholds set', () => {
    const value: NotificationPreferencesValue = { ...BASE, thresholdsByCharacter: { 1: {} } };
    expect(toSyncedFeedPrefs(value).thresholdsByCharacter).toEqual({});
  });
});

describe('withSyncedFeedPrefsApplied', () => {
  it('applies a synced feed flag while preserving the local browser flag', () => {
    const local: NotificationPreferencesValue = {
      ...BASE,
      perCharacter: { 1: { [EVENT_A]: { browser: true, feed: true } } },
    };
    const synced = toSyncedFeedPrefs({
      ...BASE,
      perCharacter: { 1: { [EVENT_A]: { browser: false, feed: false } } },
    });
    const merged = withSyncedFeedPrefsApplied(local, synced);
    expect(merged.perCharacter[1]?.[EVENT_A]).toEqual({ browser: true, feed: false });
  });

  it('does not let a remote legacy bare-boolean-off value touch the local browser flag', () => {
    const local: NotificationPreferencesValue = {
      ...BASE,
      perCharacter: { 1: { [EVENT_A]: { browser: true, feed: true } } },
    };
    // Another device stored a bare `false` (pre-channel-split "both off").
    const synced = toSyncedFeedPrefs({ ...BASE, perCharacter: { 1: { [EVENT_A]: false } } });
    const merged = withSyncedFeedPrefsApplied(local, synced);
    expect(merged.perCharacter[1]?.[EVENT_A]).toEqual({ browser: true, feed: false });
  });

  it('leaves a character absent from the synced value untouched', () => {
    const local: NotificationPreferencesValue = {
      ...BASE,
      perCharacter: { 2: { [EVENT_B]: { browser: true, feed: false } } },
    };
    const merged = withSyncedFeedPrefsApplied(local, {
      perCharacter: {},
      eveNotificationTypesByCharacter: {},
      thresholdsByCharacter: {},
    });
    expect(merged).toEqual(local);
  });

  it('merges synced thresholds over local ones field by field', () => {
    const local: NotificationPreferencesValue = {
      ...BASE,
      thresholdsByCharacter: { 1: { structureFuelLowDays: 7, corpWalletBalanceFloorIsk: 1 } },
    };
    const merged = withSyncedFeedPrefsApplied(local, {
      perCharacter: {},
      eveNotificationTypesByCharacter: {},
      thresholdsByCharacter: { 1: { structureFuelLowDays: 1 } },
    });
    expect(merged.thresholdsByCharacter?.[1]).toEqual({
      structureFuelLowDays: 1,
      corpWalletBalanceFloorIsk: 1,
    });
  });

  it('degrades to the local value unchanged when the remote blob is malformed', () => {
    const local: NotificationPreferencesValue = {
      ...BASE,
      perCharacter: { 1: { [EVENT_A]: { browser: true, feed: true } } },
    };
    expect(withSyncedFeedPrefsApplied(local, { garbage: true })).toEqual(local);
    expect(withSyncedFeedPrefsApplied(local, null)).toEqual(local);
    expect(withSyncedFeedPrefsApplied(local, 'nope')).toEqual(local);
    expect(
      withSyncedFeedPrefsApplied(local, { perCharacter: { 1: { [EVENT_A]: 'not-a-boolean' } } })
    ).toEqual(local);
  });

  it('round-trips through toSyncedFeedPrefs for eve-type feed overrides', () => {
    const local: NotificationPreferencesValue = {
      ...BASE,
      eveNotificationTypesByCharacter: {
        1: { StructureDestroyed: { browser: true, feed: true } },
      },
    };
    const synced = toSyncedFeedPrefs({
      ...BASE,
      eveNotificationTypesByCharacter: {
        1: { StructureDestroyed: { browser: false, feed: false } },
      },
    });
    const merged = withSyncedFeedPrefsApplied(local, synced);
    expect(merged.eveNotificationTypesByCharacter?.[1]?.StructureDestroyed).toEqual({
      browser: true,
      feed: false,
    });
  });
});
