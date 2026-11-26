import { describe, it, expect } from 'vitest';
import { NOTIFICATION_EVENT_IDS } from './events';
import { ROUTE_REQUIREMENTS } from '@/app/routeScopes';
import { pageKeyFor } from '@/app/pageTabs';
import {
  NOTIFICATION_ROUTES,
  NOTIFICATION_FALLBACK_ROUTE,
  notificationUrlFor,
  notificationTagFor,
  notificationOptionsFor,
  fallbackNotificationOptions,
  notificationUrlForSubject,
  occurrencePath,
} from './notificationOptions';

describe('notificationUrlFor', () => {
  it('routes every event in the catalog somewhere', () => {
    for (const eventId of NOTIFICATION_EVENT_IDS) {
      expect(NOTIFICATION_ROUTES[eventId]).toMatch(/^\//);
    }
  });

  it('sends an unknown event id to the dashboard rather than nowhere', () => {
    expect(notificationUrlFor('somethingRetired')).toBe(NOTIFICATION_FALLBACK_ROUTE);
  });

  it('opens the plans page when a skill level completes', () => {
    expect(notificationUrlFor('skillLevelComplete')).toBe('/skills/plans');
  });

  it('routes wallet alerts to the wallet journal tab', () => {
    expect(notificationUrlFor('walletBalanceChanged')).toBe('/wallet/journal');
  });

  it('opens the Structures page when a structure runs low on fuel', () => {
    expect(notificationUrlFor('structureFuelLow')).toBe('/corp/structures');
  });
});

describe('occurrencePath (issue #6225)', () => {
  const key = 'sharedMoonPop:98000001_1035_1762900000000:1763200000000:900000';

  it("opens a Shared Moon Pop's own pop on the Calendar", () => {
    expect(occurrencePath('sharedMoonPop', key)).toBe('/calendar?pop=98000001_1035_1762900000000');
  });

  it('names no path for any other event', () => {
    expect(occurrencePath('newMail', '7:newMail:1')).toBeUndefined();
  });

  it('lands a feed row on the pop, naming its Character', () => {
    expect(notificationUrlForSubject('sharedMoonPop', undefined, 7, key)).toBe(
      '/calendar?pop=98000001_1035_1762900000000&character=7'
    );
  });
});

describe('notificationTagFor', () => {
  it('separates characters so one does not replace another', () => {
    expect(notificationTagFor({ characterId: 1, eventId: 'newMail' })).not.toBe(
      notificationTagFor({ characterId: 2, eventId: 'newMail' })
    );
  });

  it('separates event types so mail does not replace industry', () => {
    expect(notificationTagFor({ characterId: 1, eventId: 'newMail' })).not.toBe(
      notificationTagFor({ characterId: 1, eventId: 'industryJobComplete' })
    );
  });

  it('collapses repeats of the same event for the same character', () => {
    expect(notificationTagFor({ characterId: 1, eventId: 'newMail' })).toBe(
      notificationTagFor({ characterId: 1, eventId: 'newMail' })
    );
  });
});

describe('notificationOptionsFor', () => {
  it('carries body, icon, badge, tag and the deep link', () => {
    const options = notificationOptionsFor(
      { characterId: 7, eventId: 'walletBalanceChanged' },
      'Pilot received 1 ISK.'
    );
    expect(options).toMatchObject({
      body: 'Pilot received 1 ISK.',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: '7:walletBalanceChanged',
      data: { url: '/wallet/journal?character=7' },
    });
  });

  it('sets renotify, without which a tag replacement would be silent', () => {
    const options = notificationOptionsFor({ characterId: 1, eventId: 'newMail' }, 'b');
    expect(options.renotify).toBe(true);
    expect(options.tag).toBeTruthy();
  });
});

describe('fallbackNotificationOptions', () => {
  it('carries the same shared icon/badge/tag/renotify shape with no target to key by', () => {
    const options = fallbackNotificationOptions('parse failed');
    expect(options).toMatchObject({
      body: 'parse failed',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: NOTIFICATION_FALLBACK_ROUTE },
    });
    expect(options.tag).toBeTruthy();
    expect(options.renotify).toBe(true);
  });

  it('uses a fixed tag so repeats replace instead of stacking', () => {
    expect(fallbackNotificationOptions('a').tag).toBe(fallbackNotificationOptions('b').tag);
  });
});

describe('NOTIFICATION_ROUTES against the real route table', () => {
  it('routes every event to a path the app actually serves', () => {
    const realRoutes = new Set<string>(Object.keys(ROUTE_REQUIREMENTS));
    for (const [eventId, route] of Object.entries(NOTIFICATION_ROUTES)) {
      const [rawPath] = route.split('?');
      const path = pageKeyFor(rawPath);
      expect(realRoutes, `${eventId} -> ${route}`).toContain(path);
    }
  });

  it('falls back to a path the app actually serves', () => {
    expect(Object.keys(ROUTE_REQUIREMENTS)).toContain(NOTIFICATION_FALLBACK_ROUTE);
  });
});
