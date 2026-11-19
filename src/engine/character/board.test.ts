import { DAY_MS, HOUR_MS } from '@/lib/age';
import { describe, expect, it } from 'vitest';
import {
  buildCharacterBoard,
  pastDeadlineLabelKey,
  type BoardCalendarEventSource,
  type BoardClockSource,
  type CharacterBoardSources,
} from './board';

const NOW = Date.parse('2026-09-07T18:42:00Z');

const at = (ms: number) => NOW + ms;

function clock(overrides: Partial<BoardClockSource> = {}): BoardClockSource {
  return { id: 'x', subject: 'Something', detail: '', deadlineMs: at(2 * HOUR_MS), ...overrides };
}

function event(overrides: Partial<BoardCalendarEventSource> = {}): BoardCalendarEventSource {
  return {
    id: '1',
    subject: 'Alliance CTA',
    detail: '',
    deadlineMs: at(2 * HOUR_MS),
    response: 'not_responded',
    important: false,
    ...overrides,
  };
}

function build(sources: Partial<CharacterBoardSources> = {}) {
  return buildCharacterBoard({ nowMs: NOW, ...sources });
}

describe('buildCharacterBoard', () => {
  it('merges every source into one deadline-ordered list', () => {
    const board = build({
      calendarEvents: [event({ id: 'e', deadlineMs: at(5 * HOUR_MS) })],
      industryJobs: [clock({ id: 'j', deadlineMs: at(1 * HOUR_MS) })],
      orderExpiries: [clock({ id: 'o', deadlineMs: at(3 * HOUR_MS) })],
    });

    expect(board.map((item) => item.sourceId)).toEqual(['j', 'o', 'e']);
    expect(board.map((item) => item.kind)).toEqual(['industryJob', 'orderExpiry', 'calendarEvent']);
  });

  /**
   * The distinction the whole page rests on: a source the Character cannot
   * read contributes nothing, and a source that read fine with nothing due
   * contributes nothing *too* — but they are different answers, and only
   * `readableKinds` may be asked which happened. Copied from the corp board's
   * own rule: "cannot read" and "nothing due" must never look alike.
   */
  it('treats an absent source and an empty one alike when building the list', () => {
    expect(build({ calendarEvents: [], industryJobs: undefined })).toEqual([]);
  });

  /**
   * Unclamped, exactly as the corp board keeps it: two overdue items differ by
   * how far past due they are, and clamping at zero here would collapse them
   * into one tie that no later sort could undo. The clamp belongs at display.
   */
  it('keeps remaining time signed so overdue items still order against each other', () => {
    const board = build({
      contractExpiries: [
        clock({ id: 'recent', deadlineMs: at(-1 * HOUR_MS) }),
        clock({ id: 'ancient', deadlineMs: at(-9 * DAY_MS) }),
      ],
    });

    expect(board.map((item) => item.sourceId)).toEqual(['ancient', 'recent']);
    expect(board[0].remainingMs).toBe(-9 * DAY_MS);
    expect(board[1].remainingMs).toBe(-1 * HOUR_MS);
  });

  /**
   * Ties are broken explicitly rather than left to sort stability, so the
   * board is a function of its inputs and not of the order this happened to
   * concatenate its sources in.
   */
  it('breaks an exact tie by kind, then by id', () => {
    const sameInstant = at(4 * HOUR_MS);
    const board = build({
      orderExpiries: [clock({ id: 'b', deadlineMs: sameInstant })],
      calendarEvents: [event({ id: 'z', deadlineMs: sameInstant })],
      industryJobs: [
        clock({ id: 'a', deadlineMs: sameInstant }),
        clock({ id: 'aa', deadlineMs: sameInstant }),
      ],
    });

    expect(board.map((item) => item.sourceId)).toEqual(['z', 'a', 'aa', 'b']);
  });

  /**
   * A calendar event past its deadline is running, not late. An industry job
   * past its deadline is finished and waiting for pickup — ESI has no signal
   * for a job genuinely overdue, so it reads the same "ready to deliver" copy
   * the detail line already uses, never "Overdue". Every other kind has no
   * such distinction: past its deadline simply means late.
   */
  it('picks the past-deadline word per kind', () => {
    expect(pastDeadlineLabelKey('calendarEvent')).toBe('calendar.started');
    expect(pastDeadlineLabelKey('industryJob')).toBe('calendar.detail.industryJob.ready');
    expect(pastDeadlineLabelKey('skillTraining')).toBe('calendar.overdue');
    expect(pastDeadlineLabelKey('contractExpiry')).toBe('calendar.overdue');
    expect(pastDeadlineLabelKey('orderExpiry')).toBe('calendar.overdue');
  });

  it('carries the RSVP state and importance of a calendar event, and nothing else', () => {
    const board = build({
      calendarEvents: [event({ id: 'e', response: 'accepted', important: true })],
      industryJobs: [clock({ id: 'j', deadlineMs: at(9 * HOUR_MS) })],
    });

    expect(board[0]).toMatchObject({ sourceId: 'e', response: 'accepted', important: true });
    expect(board[1]).toMatchObject({ sourceId: 'j', response: null, important: false });
  });

  /**
   * Ids collide across sources — an industry job and a contract can both be
   * numbered 42 — so the board's own id must be namespaced or a React key
   * repeats and the tie-break compares unrelated things.
   */
  it('namespaces ids by kind so two sources cannot collide', () => {
    const board = build({
      industryJobs: [clock({ id: '42', deadlineMs: at(1 * HOUR_MS) })],
      contractExpiries: [clock({ id: '42', deadlineMs: at(2 * HOUR_MS) })],
    });

    expect(new Set(board.map((item) => item.id)).size).toBe(2);
  });

  it('carries skyhook raid windows as their own kind, after moon chunks on a tie', () => {
    const items = build({
      skyhookRaids: [clock({ id: '5', subject: 'X-7OMU IV', detail: 'upcoming' })],
      moonChunks: [clock({ id: '7' })],
    });
    expect(items.map((item) => item.kind)).toEqual(['moonChunk', 'skyhookRaid']);
    expect(items[1]).toMatchObject({
      id: 'skyhookRaid:5',
      sourceId: '5',
      remainingMs: 2 * HOUR_MS,
    });
  });

  it('leaves the kind off the board when the raid read is not readable', () => {
    expect(build({ skyhookRaids: undefined })).toEqual([]);
  });
});
