import { describe, it, expect } from 'vitest';
import { NOTIFICATION_EVENT_IDS } from './events';
import {
  NOTIFICATION_ROUTES,
  NOTIFICATION_FALLBACK_ROUTE,
  notificationUrlFor,
  notificationTagFor,
  notificationOptionsFor,
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

  it('routes wallet alerts to the wallet', () => {
    expect(notificationUrlFor('walletBalanceChanged')).toBe('/wallet');
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
      data: { url: '/wallet' },
    });
  });

  it('sets renotify, without which a tag replacement would be silent', () => {
    const options = notificationOptionsFor({ characterId: 1, eventId: 'newMail' }, 'b');
    expect(options.renotify).toBe(true);
    expect(options.tag).toBeTruthy();
  });
});
