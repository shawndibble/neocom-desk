import { describe, expect, it } from 'vitest';
import type { NotificationPreferencesValue } from './preferencesStore';
import { isQuietTimePrefs, quietHoursPayload, quietTimeView, withQuietTime } from './quietTime';

const base: NotificationPreferencesValue = { masterEnabled: true, perCharacter: {} };

describe('quietHoursPayload', () => {
  it('is null while off, and when never set', () => {
    expect(quietHoursPayload(base)).toBeNull();
    expect(quietHoursPayload(withQuietTime(base, { enabled: false }, 'UTC'))).toBeNull();
  });

  it('carries the window, the zone captured at save and the attacks flag when on', () => {
    const on = withQuietTime(base, { enabled: true, allowAttacks: true }, 'Europe/Berlin');
    expect(quietHoursPayload(on)).toEqual({
      start: '22:00',
      end: '07:00',
      timeZone: 'Europe/Berlin',
      allowAttacks: true,
    });
  });

  it('treats equal start and end as off', () => {
    const on = withQuietTime(base, { enabled: true, start: '08:00', end: '08:00' }, 'UTC');
    expect(quietHoursPayload(on)).toBeNull();
  });

  it('treats a half-typed time as off', () => {
    expect(quietHoursPayload(withQuietTime(base, { enabled: true, start: '' }, 'UTC'))).toBeNull();
  });
});

describe('withQuietTime', () => {
  it('re-captures the zone on every save and keeps untouched fields', () => {
    const first = withQuietTime(base, { enabled: true, start: '23:00' }, 'UTC');
    const second = withQuietTime(first, { end: '06:30' }, 'Asia/Tokyo');
    expect(second.quietTime).toEqual({
      enabled: true,
      start: '23:00',
      end: '06:30',
      allowAttacks: false,
      timeZone: 'Asia/Tokyo',
    });
  });
});

describe('quietTimeView', () => {
  it('defaults to off, 22:00 to 07:00, attacks blocked', () => {
    expect(quietTimeView(base)).toEqual({
      enabled: false,
      start: '22:00',
      end: '07:00',
      allowAttacks: false,
    });
  });
});

describe('isQuietTimePrefs', () => {
  it('accepts what withQuietTime writes and rejects other shapes', () => {
    expect(isQuietTimePrefs(withQuietTime(base, { enabled: true }, 'UTC').quietTime)).toBe(true);
    expect(isQuietTimePrefs({ enabled: 'yes' })).toBe(false);
    expect(isQuietTimePrefs(null)).toBe(false);
  });
});
