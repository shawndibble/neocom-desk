import { describe, it, expect } from 'vitest';
import {
  notificationSubjectId,
  notificationUrlForSubject,
  NOTIFICATION_ROUTES,
} from './notificationOptions';
import { NOTIFICATION_EVENT_IDS } from './events';

describe('notificationSubjectId', () => {
  it('reads each subject-routed event from the field its own diff sets', () => {
    expect(notificationSubjectId({ eventId: 'marketOrderFilled', typeId: 34 })).toEqual(34);
    expect(notificationSubjectId({ eventId: 'walletBalanceChanged', journalEntryId: 77 })).toEqual(
      77
    );
    expect(notificationSubjectId({ eventId: 'contractAccepted', contractId: 5 })).toEqual(5);
    expect(notificationSubjectId({ eventId: 'industryJobComplete', jobId: 9 })).toEqual(9);
    expect(notificationSubjectId({ eventId: 'corpMemberJoined', memberCharacterId: 12 })).toEqual(
      12
    );
  });

  it('reads nothing for an event with no subject route, whatever the fire carries', () => {
    // `corpMemberLeft` is the pointed exclusion: that member is gone from the
    // roster, so a highlight would name a row that is not there.
    expect(
      notificationSubjectId({ eventId: 'corpMemberLeft', memberCharacterId: 12 })
    ).toBeUndefined();
    expect(notificationSubjectId({ eventId: 'newMail', typeId: 1 })).toBeUndefined();
    expect(notificationSubjectId({ eventId: 'somethingNewer', typeId: 1 })).toBeUndefined();
  });
});

describe('notificationUrlForSubject', () => {
  it('appends the highlight to a route that already carries a query string', () => {
    expect(notificationUrlForSubject('walletBalanceChanged', 77)).toEqual(
      '/wallet?tab=journal&highlight=77'
    );
    expect(notificationUrlForSubject('marketOrderFilled', 34)).toEqual(
      '/market?section=transactions&highlight=34'
    );
  });

  it('appends it to a route that carries none, without inventing a second `?`', () => {
    expect(notificationUrlForSubject('contractAccepted', 5)).toEqual('/contracts?highlight=5');
    expect(notificationUrlForSubject('industryJobComplete', 9)).toEqual('/industry?highlight=9');
    expect(notificationUrlForSubject('corpMemberJoined', 12)).toEqual('/corp/members?highlight=12');
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
