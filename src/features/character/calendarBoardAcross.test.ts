import { describe, expect, it } from 'vitest';
import type { BoardClockSource } from '@/engine/character/board';
import type { CalendarBoardData } from './calendarBoardData';
import { mergeCalendarBoards } from './calendarBoardAcross';

const clock = (id: string, deadlineMs = 1000): BoardClockSource => ({
  id,
  subject: `s${id}`,
  detail: '',
  deadlineMs,
});
const base: CalendarBoardData = {
  corporations: [],
  sharedPops: [],
  readableRefineries: [],
  sharingCorporations: [],
  skyhookRaidDetails: [],
  readableKinds: [],
  reauthKinds: [],
  oldestFetchedAt: null,
  fromCache: false,
  events: [],
  loadedAtMs: 1,
};
const board = (over: Partial<CalendarBoardData>): CalendarBoardData => ({ ...base, ...over });
const entry = (characterId: number, data: CalendarBoardData) => ({
  characterId,
  name: `Pilot ${characterId}`,
  data,
});

describe('mergeCalendarBoards', () => {
  it("names each Character's own clocks, and keeps two Characters' queue slots apart", () => {
    const merged = mergeCalendarBoards([
      entry(1, board({ skillTraining: [clock('0')] })),
      entry(2, board({ skillTraining: [clock('0')] })),
    ]);
    expect(merged.skillTraining).toHaveLength(2);
    expect(new Set(merged.skillTraining!.map((s) => s.id)).size).toBe(2);
    expect(merged.skillTraining!.map((s) => s.characterName)).toEqual(['Pilot 1', 'Pilot 2']);
  });

  it('lists an event, a contract or a corporation clock both Characters see once', () => {
    const merged = mergeCalendarBoards([
      entry(
        1,
        board({ calendarEvents: [{ ...clock('9'), response: 'accepted', important: false }] })
      ),
      entry(
        2,
        board({ calendarEvents: [{ ...clock('9'), response: 'tentative', important: false }] })
      ),
    ]);
    expect(merged.calendarEvents).toHaveLength(1);
    const corp = mergeCalendarBoards([
      entry(1, board({ structureFuel: [clock('f')] })),
      entry(2, board({ structureFuel: [clock('f')] })),
    ]);
    expect(corp.structureFuel).toHaveLength(1);
    expect(corp.structureFuel![0]!.characterName).toBeUndefined();
  });

  it('keeps the most committed answer to an event two Characters were both invited to', () => {
    const event = (response: 'not_responded' | 'accepted' | 'declined') => ({
      ...clock('9'),
      response,
      important: false,
    });
    const merged = mergeCalendarBoards([
      entry(1, board({ calendarEvents: [event('not_responded')] })),
      entry(2, board({ calendarEvents: [event('accepted')] })),
    ]);
    expect(merged.calendarEvents).toHaveLength(1);
    expect(merged.calendarEvents![0]).toMatchObject({
      response: 'accepted',
      characterName: 'Pilot 2',
    });
    const declined = mergeCalendarBoards([
      entry(1, board({ calendarEvents: [event('declined')] })),
      entry(2, board({ calendarEvents: [event('not_responded')] })),
    ]);
    expect(declined.calendarEvents![0]).toMatchObject({ response: 'not_responded' });
  });

  it('keeps unreadable apart from empty: a list nobody could read stays undefined', () => {
    const merged = mergeCalendarBoards([
      entry(1, board({ industryJobs: undefined })),
      entry(2, board({ industryJobs: [clock('j')] })),
    ]);
    expect(merged.industryJobs).toHaveLength(1);
    expect(
      mergeCalendarBoards([entry(1, board({})), entry(2, board({}))]).industryJobs
    ).toBeUndefined();
  });

  it('asks for a sign-in only for a kind no Character could read', () => {
    const merged = mergeCalendarBoards([
      entry(1, board({ readableKinds: ['industryJob'], reauthKinds: ['orderExpiry'] })),
      entry(
        2,
        board({ readableKinds: ['orderExpiry'], reauthKinds: ['industryJob', 'contractExpiry'] })
      ),
    ]);
    expect(merged.readableKinds.sort()).toEqual(['industryJob', 'orderExpiry']);
    expect(merged.reauthKinds).toEqual(['contractExpiry']);
  });

  it('is as fresh as the stalest read and cached if any read was', () => {
    const merged = mergeCalendarBoards([
      entry(1, board({ oldestFetchedAt: new Date(5000), loadedAtMs: 7 })),
      entry(2, board({ oldestFetchedAt: new Date(2000), fromCache: true, loadedAtMs: 9 })),
    ]);
    expect(merged.oldestFetchedAt).toEqual(new Date(2000));
    expect(merged.fromCache).toBe(true);
    expect(merged.loadedAtMs).toBe(9);
  });
});
