import { describe, it, expect } from 'vitest';
import { NOTIFICATION_EVENT_IDS } from './events';
import { ROUTE_REQUIREMENTS } from '@/app/routeScopes';
import {
  NOTIFICATION_ROUTES,
  NOTIFICATION_FALLBACK_ROUTE,
  notificationUrlFor,
  notificationTagFor,
  notificationOptionsFor,
  fallbackNotificationOptions,
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

  it('routes wallet alerts to the wallet journal tab', () => {
    expect(notificationUrlFor('walletBalanceChanged')).toBe('/wallet?tab=journal');
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
      data: { url: '/wallet?tab=journal' },
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
  // Hand-copied from App.tsx's route list, which `events.ts` deliberately
  // avoids doing for scopes ("derived from ESI_REGISTRY, never hand-copied").
  // A renamed route would still compile here and silently send every
  // notification of that type to the fallback — a dead deep link that looks
  // like a working one. This is the check that makes that fail loudly.
  it('routes every event to a path the app actually serves', () => {
    const realRoutes = new Set<string>(Object.keys(ROUTE_REQUIREMENTS));
    for (const [eventId, route] of Object.entries(NOTIFICATION_ROUTES)) {
      // A route may carry a query string (e.g. Market's own tab, `?section=`)
      // that a route path never does — strip it before checking the path is real.
      const [path] = route.split('?');
      expect(realRoutes, `${eventId} -> ${route}`).toContain(path);
    }
  });

  it('falls back to a path the app actually serves', () => {
    expect(Object.keys(ROUTE_REQUIREMENTS)).toContain(NOTIFICATION_FALLBACK_ROUTE);
  });
});
