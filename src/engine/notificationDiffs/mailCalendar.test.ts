import { describe, it, expect } from 'vitest';
import {
  diffNewMail,
  diffNewCalendarEvent,
  diffCalendarEventStarting,
  type MailHeaderSnapshot,
  type MailSnapshot,
  type CalendarEventEntrySnapshot,
  type CalendarSnapshot,
} from './index';

const T0 = 1_000_000;
const FIVE_MIN = 5 * 60 * 1000;

function mailEntry(mailId: number): MailHeaderSnapshot {
  return { mailId };
}

function mailSnapshot(entries: readonly MailHeaderSnapshot[], nowMs: number): MailSnapshot {
  return { entries, nowMs };
}

describe('diffNewMail', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = mailSnapshot([mailEntry(5)], T0);
    expect(diffNewMail(1, undefined, next)).toEqual([]);
  });

  it('fires when a mail id above the previous high-water mark appears', () => {
    const prev = mailSnapshot([mailEntry(5), mailEntry(3)], T0);
    const next = mailSnapshot([mailEntry(6), mailEntry(5), mailEntry(3)], T0 + 2000);
    expect(diffNewMail(7, prev, next)).toEqual([{ eventId: 'newMail', characterId: 7, mailId: 6 }]);
  });

  it("carries the mail's own sent time, to date the feed row", () => {
    const prev = mailSnapshot([mailEntry(5)], T0);
    const next = mailSnapshot([{ mailId: 6, sentMs: T0 - 60_000 }, mailEntry(5)], T0 + 2000);
    expect(diffNewMail(7, prev, next)).toEqual([
      { eventId: 'newMail', characterId: 7, mailId: 6, sentMs: T0 - 60_000 },
    ]);
  });

  it('does not fire for mail the character sent itself', () => {
    const prev = mailSnapshot([mailEntry(5)], T0);
    const next = mailSnapshot(
      [{ mailId: 7, fromId: 7 }, { mailId: 6, fromId: 99 }, mailEntry(5)],
      T0 + 2000
    );
    expect(diffNewMail(7, prev, next)).toEqual([{ eventId: 'newMail', characterId: 7, mailId: 6 }]);
  });

  it('does not fire for an id already seen', () => {
    const prev = mailSnapshot([mailEntry(5)], T0);
    const next = mailSnapshot([mailEntry(5)], T0 + 2000);
    expect(diffNewMail(7, prev, next)).toEqual([]);
  });

  it('does not fire for an older id newly paged in below the high-water mark ("load more")', () => {
    const prev = mailSnapshot([mailEntry(10)], T0);
    const next = mailSnapshot([mailEntry(10), mailEntry(9), mailEntry(1)], T0 + 2000);
    expect(diffNewMail(7, prev, next)).toEqual([]);
  });

  it('fires once per new mail id when multiple arrive in the same poll', () => {
    const prev = mailSnapshot([mailEntry(5)], T0);
    const next = mailSnapshot([mailEntry(7), mailEntry(6), mailEntry(5)], T0 + 2000);
    expect(diffNewMail(7, prev, next)).toEqual([
      { eventId: 'newMail', characterId: 7, mailId: 7 },
      { eventId: 'newMail', characterId: 7, mailId: 6 },
    ]);
  });
});

function calendarEntry(
  calendarEventId: number,
  startMs: number,
  title?: string,
  response?: CalendarEventEntrySnapshot['response']
): CalendarEventEntrySnapshot {
  return {
    calendarEventId,
    startMs,
    ...(title === undefined ? {} : { title }),
    ...(response === undefined ? {} : { response }),
  };
}

function calendarSnapshot(
  entries: readonly CalendarEventEntrySnapshot[],
  nowMs: number
): CalendarSnapshot {
  return { entries, nowMs };
}

describe('diffNewCalendarEvent', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = calendarSnapshot([calendarEntry(5, T0 + 1000)], T0);
    expect(diffNewCalendarEvent(1, undefined, next)).toEqual([]);
  });

  it('fires when an event id above the previous high-water mark appears', () => {
    const prev = calendarSnapshot([calendarEntry(5, T0 + 1000)], T0);
    const next = calendarSnapshot(
      [calendarEntry(6, T0 + 5000), calendarEntry(5, T0 + 1000)],
      T0 + 2000
    );
    expect(diffNewCalendarEvent(7, prev, next)).toEqual([
      { eventId: 'newCalendarEvent', characterId: 7, calendarEventId: 6, startMs: T0 + 5000 },
    ]);
  });

  it("carries the event's name and start, so the alert can say which event and when", () => {
    const prev = calendarSnapshot([calendarEntry(5, T0 + 1000, 'Old Op')], T0);
    const next = calendarSnapshot(
      [calendarEntry(6, T0 + 5000, 'Fleet Op'), calendarEntry(5, T0 + 1000, 'Old Op')],
      T0 + 2000
    );
    expect(diffNewCalendarEvent(7, prev, next)).toEqual([
      {
        eventId: 'newCalendarEvent',
        characterId: 7,
        calendarEventId: 6,
        startMs: T0 + 5000,
        title: 'Fleet Op',
      },
    ]);
  });

  it('does not fire for an older event newly entering the 50-event window', () => {
    const prev = calendarSnapshot([calendarEntry(10, T0 + 1000)], T0);
    const next = calendarSnapshot(
      [calendarEntry(10, T0 + 1000), calendarEntry(2, T0 + 500)],
      T0 + 2000
    );
    expect(diffNewCalendarEvent(7, prev, next)).toEqual([]);
  });
});

describe('diffCalendarEventStarting', () => {
  it('fires nothing on the first-ever poll', () => {
    const next = calendarSnapshot([calendarEntry(1, T0 - 1000)], T0);
    expect(diffCalendarEventStarting(1, undefined, next)).toEqual([]);
  });

  it('fires when an event newly starts', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 + 1000)], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 1000)], T0 + 2000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([
      { eventId: 'calendarEventStarting', characterId: 7, calendarEventId: 1 },
    ]);
  });

  it('does not fire before the event starts', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 + 5000)], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 5000)], T0 + 1000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([]);
  });

  it('does not re-fire for an event that already started as of the previous poll', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 - 5000)], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 - 5000)], T0 + FIVE_MIN);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([]);
  });

  it("carries the event's name, so the alert can say which event started", () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 + 1000, 'Fleet Op')], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 1000, 'Fleet Op')], T0 + 2000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([
      { eventId: 'calendarEventStarting', characterId: 7, calendarEventId: 1, title: 'Fleet Op' },
    ]);
  });

  it('omits the name for a snapshot written before it was recorded, rather than inventing one', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 + 1000)], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 1000)], T0 + 2000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([
      { eventId: 'calendarEventStarting', characterId: 7, calendarEventId: 1 },
    ]);
  });

  it('fires for an event that only appears once already started (never seen upcoming before)', () => {
    const prev = calendarSnapshot([], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 1000)], T0 + 2000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([
      { eventId: 'calendarEventStarting', characterId: 7, calendarEventId: 1 },
    ]);
  });

  it('does not fire for an event the character declined', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 + 1000, 'Fleet Op', 'declined')], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 1000, 'Fleet Op', 'declined')], T0 + 2000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([]);
  });

  it('still fires for an accepted event (regression guard)', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 + 1000, 'Fleet Op', 'accepted')], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 1000, 'Fleet Op', 'accepted')], T0 + 2000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([
      { eventId: 'calendarEventStarting', characterId: 7, calendarEventId: 1, title: 'Fleet Op' },
    ]);
  });

  it('still fires for an event with no response recorded', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 + 1000, 'Fleet Op', 'not_responded')], T0);
    const next = calendarSnapshot(
      [calendarEntry(1, T0 + 1000, 'Fleet Op', 'not_responded')],
      T0 + 2000
    );
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([
      { eventId: 'calendarEventStarting', characterId: 7, calendarEventId: 1, title: 'Fleet Op' },
    ]);
  });

  it('still fires for a snapshot written before response was recorded (undefined defaults to notifying)', () => {
    const prev = calendarSnapshot([calendarEntry(1, T0 + 1000, 'Fleet Op')], T0);
    const next = calendarSnapshot([calendarEntry(1, T0 + 1000, 'Fleet Op')], T0 + 2000);
    expect(diffCalendarEventStarting(7, prev, next)).toEqual([
      { eventId: 'calendarEventStarting', characterId: 7, calendarEventId: 1, title: 'Fleet Op' },
    ]);
  });
});
