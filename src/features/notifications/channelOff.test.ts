import { describe, expect, it } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './preferencesStore';
import { channelOffReasons } from './channelOff';

const prefs = DEFAULT_NOTIFICATION_PREFERENCES;

describe('channelOffReasons', () => {
  it('leaves both channels usable when permission is granted and both toggles are on', () => {
    expect(
      channelOffReasons({ permission: 'granted', installRequired: false, prefsValue: prefs })
    ).toEqual({ browser: null, feed: null });
  });

  it.each([
    ['denied', 'permissionDenied'],
    ['default', 'permissionDefault'],
    ['unsupported', 'permissionUnsupported'],
  ] as const)('turns Device off for %s permission', (permission, reason) => {
    expect(
      channelOffReasons({ permission, installRequired: false, prefsValue: prefs }).browser
    ).toBe(reason);
  });

  it('turns both channels off while the master switch is off, whatever else is true', () => {
    expect(
      channelOffReasons({
        permission: 'granted',
        installRequired: false,
        prefsValue: { ...prefs, masterEnabled: false },
      })
    ).toEqual({ browser: 'masterOff', feed: 'masterOff' });
  });

  it('says install first, even when the permission reads default', () => {
    expect(
      channelOffReasons({ permission: 'default', installRequired: true, prefsValue: prefs }).browser
    ).toBe('installRequired');
  });

  it('says install first on a platform that needs the app installed', () => {
    expect(
      channelOffReasons({ permission: 'unsupported', installRequired: true, prefsValue: prefs })
        .browser
    ).toBe('installRequired');
  });

  it('turns Device off when its toggle is off, with permission granted', () => {
    expect(
      channelOffReasons({
        permission: 'granted',
        installRequired: false,
        prefsValue: { ...prefs, browserEnabled: false },
      }).browser
    ).toBe('deviceToggleOff');
  });

  it('names the permission, not the toggle, when both are off', () => {
    expect(
      channelOffReasons({
        permission: 'default',
        installRequired: false,
        prefsValue: { ...prefs, browserEnabled: false },
      }).browser
    ).toBe('permissionDefault');
  });

  it('turns Alerts off only by its own toggle, whatever the permission', () => {
    expect(
      channelOffReasons({
        permission: 'denied',
        installRequired: false,
        prefsValue: { ...prefs, feedEnabled: false },
      }).feed
    ).toBe('alertsToggleOff');
    expect(
      channelOffReasons({ permission: 'denied', installRequired: false, prefsValue: prefs }).feed
    ).toBeNull();
  });
});
