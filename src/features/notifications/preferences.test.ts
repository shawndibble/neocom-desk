import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import type { NotificationEventId } from './events';
import {
  useNotificationPreferences,
  NOTIFICATION_PREFS_SETTING_KEY,
  DEFAULT_NOTIFICATION_PREFERENCES,
  characterEventPrefs,
  withMasterEnabled,
  withEventToggled,
  withAllEventsToggledForCharacter,
  isBrowserChannelEnabled,
  isFeedChannelEnabled,
  withBrowserEnabled,
  withFeedEnabled,
} from './preferences';

const EVENT_A = 'skillLevelComplete' satisfies NotificationEventId;
const EVENT_B = 'newMail' satisfies NotificationEventId;

beforeEach(async () => {
  await db.settings.clear();
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: false });
});

describe('useNotificationPreferences', () => {
  it('defaults to the master switch on with no per-character overrides, unhydrated', () => {
    expect(useNotificationPreferences.getState().value).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    expect(useNotificationPreferences.getState().hydrated).toBe(false);
  });

  it('persists a value to Dexie under the notificationPreferences key', async () => {
    await useNotificationPreferences.getState().setValue({
      masterEnabled: false,
      perCharacter: { 1: { [EVENT_A]: false } },
    });
    expect((await db.settings.get(NOTIFICATION_PREFS_SETTING_KEY))?.value).toEqual({
      masterEnabled: false,
      perCharacter: { 1: { [EVENT_A]: false } },
    });
  });

  it('applies a persisted value on hydrate', async () => {
    await db.settings.put({
      key: NOTIFICATION_PREFS_SETTING_KEY,
      value: { masterEnabled: false, perCharacter: { 2: { [EVENT_B]: false } } },
    });
    await useNotificationPreferences.getState().hydrate();
    expect(useNotificationPreferences.getState().value).toEqual({
      masterEnabled: false,
      perCharacter: { 2: { [EVENT_B]: false } },
    });
  });

  it('falls back to the default when the stored value has the wrong shape', async () => {
    await db.settings.put({ key: NOTIFICATION_PREFS_SETTING_KEY, value: { masterEnabled: 'yes' } });
    await useNotificationPreferences.getState().hydrate();
    expect(useNotificationPreferences.getState().value).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });

  it('rejects a perCharacter entry whose event flags are not booleans', async () => {
    await db.settings.put({
      key: NOTIFICATION_PREFS_SETTING_KEY,
      value: { masterEnabled: true, perCharacter: { 1: { [EVENT_A]: 'nope' } } },
    });
    await useNotificationPreferences.getState().hydrate();
    expect(useNotificationPreferences.getState().value).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
  });
});

describe('characterEventPrefs', () => {
  it('returns an empty map for a character with no overrides', () => {
    expect(characterEventPrefs(DEFAULT_NOTIFICATION_PREFERENCES, 1)).toEqual({});
  });

  it("returns the character's stored map", () => {
    const value = { masterEnabled: true, perCharacter: { 1: { [EVENT_A]: false } } };
    expect(characterEventPrefs(value, 1)).toEqual({ [EVENT_A]: false });
  });
});

describe('withMasterEnabled', () => {
  it('flips only the master switch, leaving per-character prefs untouched', () => {
    const value = { masterEnabled: true, perCharacter: { 1: { [EVENT_A]: false } } };
    expect(withMasterEnabled(value, false)).toEqual({
      masterEnabled: false,
      perCharacter: { 1: { [EVENT_A]: false } },
    });
  });
});

describe('withEventToggled', () => {
  it('disables an event that was on by default (absent)', () => {
    const next = withEventToggled(DEFAULT_NOTIFICATION_PREFERENCES, 1, EVENT_A);
    expect(characterEventPrefs(next, 1)).toEqual({ [EVENT_A]: false });
  });

  it('re-enables an event that was explicitly disabled', () => {
    const value = { masterEnabled: true, perCharacter: { 1: { [EVENT_A]: false } } };
    const next = withEventToggled(value, 1, EVENT_A);
    expect(characterEventPrefs(next, 1)).toEqual({ [EVENT_A]: true });
  });

  it("does not disturb another character's prefs", () => {
    const value = { masterEnabled: true, perCharacter: { 2: { [EVENT_B]: false } } };
    const next = withEventToggled(value, 1, EVENT_A);
    expect(characterEventPrefs(next, 2)).toEqual({ [EVENT_B]: false });
  });
});

describe('withAllEventsToggledForCharacter', () => {
  it('disables every listed event when all are currently enabled', () => {
    const next = withAllEventsToggledForCharacter(DEFAULT_NOTIFICATION_PREFERENCES, 1, [
      EVENT_A,
      EVENT_B,
    ]);
    expect(characterEventPrefs(next, 1)).toEqual({ [EVENT_A]: false, [EVENT_B]: false });
  });

  it("does not disturb another character's prefs", () => {
    const value = { masterEnabled: true, perCharacter: { 2: { [EVENT_B]: false } } };
    const next = withAllEventsToggledForCharacter(value, 1, [EVENT_A]);
    expect(characterEventPrefs(next, 2)).toEqual({ [EVENT_B]: false });
  });
});

describe('delivery channels', () => {
  it('treats an absent channel flag as enabled, so pre-channel prefs keep working', () => {
    const stored = { masterEnabled: true, perCharacter: {} };
    expect(isBrowserChannelEnabled(stored)).toBe(true);
    expect(isFeedChannelEnabled(stored)).toBe(true);
  });

  it('reads an explicit false', () => {
    expect(
      isBrowserChannelEnabled({ masterEnabled: true, browserEnabled: false, perCharacter: {} })
    ).toBe(false);
    expect(
      isFeedChannelEnabled({ masterEnabled: true, feedEnabled: false, perCharacter: {} })
    ).toBe(false);
  });

  it('toggles each channel independently of the other and of the master switch', () => {
    const base = { masterEnabled: true, perCharacter: { 1: { [EVENT_A]: false } } };
    const noBrowser = withBrowserEnabled(base, false);
    expect(isBrowserChannelEnabled(noBrowser)).toBe(false);
    expect(isFeedChannelEnabled(noBrowser)).toBe(true);
    expect(noBrowser.masterEnabled).toBe(true);
    expect(noBrowser.perCharacter).toEqual(base.perCharacter);

    const neither = withFeedEnabled(noBrowser, false);
    expect(isBrowserChannelEnabled(neither)).toBe(false);
    expect(isFeedChannelEnabled(neither)).toBe(false);
  });

  it('hydrates a stored value that predates channels without dropping per-character toggles', async () => {
    await db.settings.put({
      key: NOTIFICATION_PREFS_SETTING_KEY,
      value: { masterEnabled: true, perCharacter: { 7: { [EVENT_B]: false } } },
    });
    await useNotificationPreferences.getState().hydrate();
    const value = useNotificationPreferences.getState().value;
    expect(value.perCharacter).toEqual({ 7: { [EVENT_B]: false } });
    expect(isBrowserChannelEnabled(value)).toBe(true);
    expect(isFeedChannelEnabled(value)).toBe(true);
  });
});
