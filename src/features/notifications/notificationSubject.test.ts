import { describe, it, expect } from 'vitest';
import { notificationUrlForSubject, NOTIFICATION_ROUTES } from './notificationOptions';
import { NOTIFICATION_EVENT_IDS } from './events';

describe('notificationUrlForSubject', () => {
  it('appends the highlight to a route that already carries a query string', () => {
    expect(notificationUrlForSubject('walletBalanceChanged', 77)).toEqual(
      '/wallet/journal?highlight=77'
    );
  });

  it('appends it to a route that carries none, without inventing a second `?`', () => {
    expect(notificationUrlForSubject('industryJobComplete', 9)).toEqual('/industry?highlight=9');
    expect(notificationUrlForSubject('corpMemberJoined', 12)).toEqual('/corp/members?highlight=12');
    expect(notificationUrlForSubject('marketOrderFilled', 34)).toEqual(
      '/market/history/transactions?highlight=34'
    );
    // A path, not a `?tab=` query, is what picks History now (ADR 0015).
    expect(notificationUrlForSubject('contractAccepted', 5)).toEqual(
      '/contracts/history?highlight=5'
    );
    expect(notificationUrlForSubject('contractCompleted', 6)).toEqual(
      '/contracts/history?highlight=6'
    );
    expect(notificationUrlForSubject('contractFailed', 7)).toEqual(
      '/contracts/history?highlight=7'
    );
  });

  it('falls back to the plain route when the row carries no subject', () => {
    // An older build's feed row, or one Web Push wrote.
    for (const eventId of NOTIFICATION_EVENT_IDS) {
      expect(notificationUrlForSubject(eventId, undefined)).toEqual(NOTIFICATION_ROUTES[eventId]);
    }
  });

  it('ignores a subject on an event that has no use for one', () => {
    expect(notificationUrlForSubject('newMail', 42)).toEqual('/mail');
  });
});

describe('notificationUrlForSubject character', () => {
  it('appends the alerted Character to a subject route', () => {
    expect(notificationUrlForSubject('industryJobComplete', 9, 42)).toEqual(
      '/industry?highlight=9&character=42'
    );
  });

  it('appends it to a subject-less route too', () => {
    expect(notificationUrlForSubject('newMail', undefined, 42)).toEqual('/mail?character=42');
  });
});
