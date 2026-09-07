import { describe, expect, it } from 'vitest';
import {
  CHARACTER_BOARD_ITEM_KINDS,
  buildCharacterBoard,
  readableKinds,
  type BoardCalendarEventSource,
  type BoardClockSource,
  type CharacterBoardSources,
} from './board';

const NOW = Date.parse('2026-09-07T18:42:00Z');
const HOUR = 3_600_000;
const DAY = 86_400_000;

const at = (ms: number) => NOW + ms;

function clock(overrides: Partial<BoardClockSource> = {}): BoardClockSource {
  return { id: 'x', subject: 'Something', detail: '', deadlineMs: at(2 * HOUR), ...overrides };
}

function event(overrides: Partial<BoardCalendarEventSource> = {}): BoardCalendarEventSource {
  return {
    id: '1',
    subject: 'Alliance CTA',
    detail: '',
    deadlineMs: at(2 * HOUR),
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
      calendarEvents: [event({ id: 'e', deadlineMs: at(5 * HOUR) })],
      industryJobs: [clock({ id: 'j', deadlineMs: at(1 * HOUR) })],
      orderExpiries: [clock({ id: 'o', deadlineMs: at(3 * HOUR) })],
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
  it('treats an absent source as unreadable and an empty one as read-fine', () => {
    const sources = { calendarEvents: [], industryJobs: undefined };
    expect(build(sources)).toEqual([]);
    expect(readableKinds({ nowMs: NOW, ...sources })).toEqual(new Set(['calendarEvent']));
  });

  it('reports every kind that was read, even when all of them are empty', () => {
    const kinds = readableKinds({
      nowMs: NOW,
      calendarEvents: [],
      skillTraining: [],
      industryJobs: [],
      planetExtractions: [],
      contractExpiries: [],
      orderExpiries: [],
    });
    expect(kinds).toEqual(new Set(CHARACTER_BOARD_ITEM_KINDS));
  });

  /**
   * Unclamped, exactly as the corp board keeps it: two overdue items differ by
   * how far past due they are, and clamping at zero here would collapse them
   * into one tie that no later sort could undo. The clamp belongs at display.
   */
  it('keeps remaining time signed so overdue items still order against each other', () => {
    const board = build({
      contractExpiries: [
        clock({ id: 'recent', deadlineMs: at(-1 * HOUR) }),
        clock({ id: 'ancient', deadlineMs: at(-9 * DAY) }),
      ],
    });

    expect(board.map((item) => item.sourceId)).toEqual(['ancient', 'recent']);
    expect(board[0].remainingMs).toBe(-9 * DAY);
    expect(board[1].remainingMs).toBe(-1 * HOUR);
  });

  it('derives severity from the shared ladder, not from the kind', () => {
    const board = build({
      calendarEvents: [event({ id: 'soon', deadlineMs: at(2 * HOUR) })],
      orderExpiries: [clock({ id: 'far', deadlineMs: at(30 * DAY) })],
    });

    expect(board.find((item) => item.sourceId === 'soon')?.severity).toBe('critical');
    expect(board.find((item) => item.sourceId === 'far')?.severity).toBe('clear');
  });

  /**
   * Ties are broken explicitly rather than left to sort stability, so the
   * board is a function of its inputs and not of the order this happened to
   * concatenate its sources in.
   */
  it('breaks an exact tie by kind, then by id', () => {
    const sameInstant = at(4 * HOUR);
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

  it('carries the RSVP state and importance of a calendar event, and nothing else', () => {
    const board = build({
      calendarEvents: [event({ id: 'e', response: 'accepted', important: true })],
      industryJobs: [clock({ id: 'j', deadlineMs: at(9 * HOUR) })],
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
      industryJobs: [clock({ id: '42', deadlineMs: at(1 * HOUR) })],
      contractExpiries: [clock({ id: '42', deadlineMs: at(2 * HOUR) })],
    });

    expect(new Set(board.map((item) => item.id)).size).toBe(2);
  });
});
