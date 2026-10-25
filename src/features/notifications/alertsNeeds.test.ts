import { describe, it, expect } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './preferencesStore';
import { alertsNeeds, planAlertsWalk, summarizeAlertsNeeds } from './alertsNeeds';
import { ALERTS_LOCATION_SCOPE, ALERTS_MAIL_SCOPE } from '@/auth/alertsScope';

const MAIL = ALERTS_MAIL_SCOPE;
const LOC = ALERTS_LOCATION_SCOPE;
const withDevice = (...scopes: string[]) => new Map([[1, new Set(scopes)]]);
const supported = { supported: true, characterIds: [] as number[] };
const unsupported = { supported: false, characterIds: [] as number[] };
const base = {
  characters: [{ characterId: 1 }],
  prefs: DEFAULT_NOTIFICATION_PREFERENCES,
  grants: {},
  nearby: supported,
  mail: supported,
  deviceScopes: withDevice(MAIL, LOC),
};
const on = { status: 'active' as const, enabledAt: 1 };

describe('alertsNeeds', () => {
  it('a default Character wants all three: the structure types, newMail and the nearby events are Device-on', () => {
    const [need] = alertsNeeds(base);
    expect(need.wanted).toEqual(['notifications', 'location', 'mail']);
    expect(need.missing).toEqual(['notifications', 'location', 'mail']);
    expect(need.needsWalk).toBe(true);
  });

  it('asks for nothing the server has not announced', () => {
    const [need] = alertsNeeds({ ...base, nearby: unsupported, mail: unsupported });
    expect(need.wanted).toEqual(['notifications']);
  });

  it('ignores an event whose Device box is off', () => {
    const prefs = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      perCharacter: {
        1: {
          newMail: { browser: false },
          incursionNearby: { browser: false },
          skyhookRaidableNearby: { browser: false },
        },
      },
    };
    const [need] = alertsNeeds({ ...base, prefs });
    expect(need.wanted).toEqual(['notifications']);
  });

  it('ignores an event the Character cannot use on this device (scope not held)', () => {
    const [need] = alertsNeeds({ ...base, deviceScopes: withDevice(LOC) });
    expect(need.wanted).toEqual(['notifications', 'location']);
  });

  it('wants nothing while the master switch or the Device channel is off', () => {
    const off = { ...DEFAULT_NOTIFICATION_PREFERENCES, masterEnabled: false };
    expect(alertsNeeds({ ...base, prefs: off })[0].needsWalk).toBe(false);
    const noBrowser = { ...DEFAULT_NOTIFICATION_PREFERENCES, browserEnabled: false };
    expect(alertsNeeds({ ...base, prefs: noBrowser })[0].wanted).toEqual([]);
  });

  it('keeps what a grant already holds even when the event is no longer ticked', () => {
    const prefs = {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      perCharacter: { 1: { newMail: { browser: false } } },
    };
    const [need] = alertsNeeds({
      ...base,
      prefs,
      grants: { 1: on },
      mail: { supported: true, characterIds: [1] },
    });
    expect(need.wanted).toEqual(['notifications', 'location', 'mail']);
    expect(need.missing).toEqual(['location']);
  });

  it('a Character holding everything it needs is skipped', () => {
    const [need] = alertsNeeds({
      ...base,
      grants: { 1: on },
      nearby: { supported: true, characterIds: [1] },
      mail: { supported: true, characterIds: [1] },
    });
    expect(need.needsWalk).toBe(false);
    expect(need.missing).toEqual([]);
  });

  it('a Character needing re-authorization is walked and asked for all it wants', () => {
    const [need] = alertsNeeds({
      ...base,
      grants: { 1: { status: 'needs-reauth', enabledAt: 1 } },
      nearby: { supported: true, characterIds: [1] },
      mail: unsupported,
    });
    expect(need.needsWalk).toBe(true);
    expect(need.missing).toEqual(['notifications', 'location']);
  });

  it('Characters differ', () => {
    const needs = alertsNeeds({
      ...base,
      characters: [{ characterId: 1 }, { characterId: 2 }],
      prefs: {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        perCharacter: { 2: { newMail: { browser: false } } },
      },
      deviceScopes: new Map([
        [1, new Set([MAIL, LOC])],
        [2, new Set([MAIL, LOC])],
      ]),
    });
    expect(needs.map((n) => n.wanted)).toEqual([
      ['notifications', 'location', 'mail'],
      ['notifications', 'location'],
    ]);
  });
});

describe('planAlertsWalk', () => {
  it('one step per Character that needs a sign-in, with exactly its union', () => {
    const needs = alertsNeeds({
      ...base,
      characters: [{ characterId: 1 }, { characterId: 2 }, { characterId: 3 }],
      grants: { 3: on },
      nearby: { supported: true, characterIds: [3] },
      mail: { supported: true, characterIds: [3] },
      deviceScopes: new Map([
        [1, new Set([MAIL, LOC])],
        [2, new Set([LOC])],
        [3, new Set([MAIL, LOC])],
      ]),
    });
    expect(planAlertsWalk(needs, { location: true, mail: true })).toEqual([
      { characterId: 1, nearby: true, mail: true },
      { characterId: 2, nearby: true, mail: false },
    ]);
  });

  it('leaving an optional permission out drops it from new asks but never from held ones', () => {
    const needs = alertsNeeds({
      ...base,
      grants: { 1: on },
      nearby: { supported: true, characterIds: [1] },
      mail: { supported: true, characterIds: [] },
    });
    expect(planAlertsWalk(needs, { location: true, mail: false })).toEqual([]);
    const fresh = alertsNeeds(base);
    expect(planAlertsWalk(fresh, { location: false, mail: false })).toEqual([
      { characterId: 1, nearby: false, mail: false },
    ]);
  });
});

describe('summarizeAlertsNeeds', () => {
  it('counts Characters and unions the missing permissions, in a fixed order', () => {
    const needs = alertsNeeds({
      ...base,
      characters: [{ characterId: 1 }, { characterId: 2 }],
      deviceScopes: new Map([
        [1, new Set([MAIL])],
        [2, new Set([LOC])],
      ]),
    });
    expect(summarizeAlertsNeeds(needs)).toEqual({
      characters: 2,
      permissions: ['notifications', 'location', 'mail'],
    });
  });
});
