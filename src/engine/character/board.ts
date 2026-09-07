/**
 * The character's Coming Up board: six heterogeneous clocks in, one ordered
 * list out.
 *
 * The corp side of this exists already (`engine/corp/board.ts`) and answers the
 * same question for a director. This is the same idea aimed at the pilot: a
 * fleet op they said they would attend, a skill about to finish and waste
 * training time, a job sitting undelivered, an extractor program running out,
 * a contract about to expire with collateral on it, a sell order about to
 * lapse. Those live in six ESI endpoints and, before this, on five separate
 * routes. Merging them into one deadline-ordered list *is* the feature.
 *
 * Pure by construction (CLAUDE.md): plain numbers and strings in, plain objects
 * out. `nowMs` is a parameter rather than a `Date.now()` call, so every
 * ordering and every severity is deterministic under test. Callers adapt the
 * ESI shapes at the boundary (`features/character/calendarBoardSources.ts`) —
 * this ranks, it does not fetch, parse a date or look a name up.
 *
 * Unlike the corp board there is no `timing` union here. Every character clock
 * is a real instant or it is not on the board at all: a paused skill queue has
 * no `finish_date`, and "not training" is a standing fault the notification
 * system already reports, not a countdown. The adapter drops those rather than
 * inventing an untimed row with nothing to sort on.
 */

import { severityForRemaining, type DeadlineSeverity } from '../severity';

/**
 * The kinds of clock the board merges, in the order that breaks a deadline tie.
 *
 * The order is a judgement about what a pilot should read first when two
 * things fall due at the same instant: a commitment made to other people
 * first, then their own training, then the things that merely sit and wait.
 */
export const CHARACTER_BOARD_ITEM_KINDS = [
  'calendarEvent',
  'skillTraining',
  'industryJob',
  'planetExtraction',
  'contractExpiry',
  'orderExpiry',
] as const;

export type CharacterBoardItemKind = (typeof CHARACTER_BOARD_ITEM_KINDS)[number];

/** ESI's own RSVP enum, carried through so the rail can flag "you owe an answer". */
export type CalendarResponse = 'declined' | 'not_responded' | 'accepted' | 'tentative';

/** What every source hands in: an identity, what to say about it, and when. */
export interface BoardClockSource {
  /**
   * Unique *within its own kind* — an ESI id, near enough always. The board
   * namespaces it into `id`, because a job and a contract can both be 42.
   */
  id: string;
  /** What the clock is about, already named by the caller. */
  subject: string;
  /**
   * A second fact the row needs — a location, an activity, a product. Empty
   * when the kind needs none. Never a translated string: this is data, and the
   * view owns the wording.
   */
  detail: string;
  /** Epoch ms the clock runs out. Already parsed; a NaN must never reach here. */
  deadlineMs: number;
}

/** A calendar event, which alone carries an RSVP state and an importance flag. */
export interface BoardCalendarEventSource extends BoardClockSource {
  response: CalendarResponse;
  /** ESI's `importance`, already reduced to a flag by the adapter. */
  important: boolean;
}

export interface CharacterBoardItem extends BoardClockSource {
  /** `<kind>:<sourceId>`. Unique across the whole board: React key, last tie-break. */
  id: string;
  /** The source's own id, kept for deep links and context menus. */
  sourceId: string;
  kind: CharacterBoardItemKind;
  /**
   * `deadlineMs - nowMs`, deliberately **unclamped**: an overdue item's
   * distance past its deadline is what orders it against the other overdue
   * items, and clamping at zero (as a display countdown does) would collapse
   * every one of them into a single tie. Clamp at the point of display.
   */
  remainingMs: number;
  severity: DeadlineSeverity;
  /** Calendar events only; `null` for every other kind. */
  response: CalendarResponse | null;
  /** Calendar events only; `false` for every other kind. */
  important: boolean;
}

/**
 * Every source is optional, and **absent means _not readable_, not empty**.
 *
 * This is the whole reason the page can survive a revoked scope: a Character
 * without `esi-industry.read_character_jobs.v1` passes `industryJobs:
 * undefined` and the board simply has no jobs in it, while one whose jobs read
 * fine and has none passes `[]`. The two produce an identical list, and which
 * happened is answered by the loader (`calendarBoardData.ts`) rather than here
 * — it is what lets the filter menu say "not granted" or "unavailable" where
 * it would otherwise say a misleading zero.
 */
export interface CharacterBoardSources {
  /** The instant the board is rendered for. A parameter, never `Date.now()`. */
  nowMs: number;
  calendarEvents?: readonly BoardCalendarEventSource[];
  skillTraining?: readonly BoardClockSource[];
  industryJobs?: readonly BoardClockSource[];
  planetExtractions?: readonly BoardClockSource[];
  contractExpiries?: readonly BoardClockSource[];
  orderExpiries?: readonly BoardClockSource[];
}

/** Which `CharacterBoardSources` field carries each kind — the one place the two names meet. */
const SOURCE_KEY = {
  calendarEvent: 'calendarEvents',
  skillTraining: 'skillTraining',
  industryJob: 'industryJobs',
  planetExtraction: 'planetExtractions',
  contractExpiry: 'contractExpiries',
  orderExpiry: 'orderExpiries',
} as const satisfies Record<CharacterBoardItemKind, keyof CharacterBoardSources>;

const KIND_RANK = new Map<CharacterBoardItemKind, number>(
  CHARACTER_BOARD_ITEM_KINDS.map((kind, index) => [kind, index])
);

function isCalendarEvent(source: BoardClockSource): source is BoardCalendarEventSource {
  return 'response' in source;
}

function toItem(
  source: BoardClockSource,
  kind: CharacterBoardItemKind,
  nowMs: number
): CharacterBoardItem {
  const remainingMs = source.deadlineMs - nowMs;
  return {
    id: `${kind}:${source.id}`,
    sourceId: source.id,
    kind,
    subject: source.subject,
    detail: source.detail,
    deadlineMs: source.deadlineMs,
    remainingMs,
    severity: severityForRemaining(remainingMs),
    response: isCalendarEvent(source) ? source.response : null,
    important: isCalendarEvent(source) ? source.important : false,
  };
}

/**
 * Merge, then order by deadline.
 *
 * Ties are broken explicitly rather than left to `Array.prototype.sort`'s
 * stability: equal deadlines would otherwise inherit whatever order this
 * function happened to concatenate its sources in, so the board would be a
 * function of its inputs *and* of their arrival order. Kind first, then the
 * namespaced id, which is unique — so the comparison is total and the result
 * is reproducible.
 */
export function buildCharacterBoard(sources: CharacterBoardSources): CharacterBoardItem[] {
  const items: CharacterBoardItem[] = [];
  for (const kind of CHARACTER_BOARD_ITEM_KINDS) {
    for (const source of sources[SOURCE_KEY[kind]] ?? []) {
      items.push(toItem(source, kind, sources.nowMs));
    }
  }

  return items.sort((a, b) => {
    const byDeadline = a.deadlineMs - b.deadlineMs;
    if (byDeadline !== 0) return byDeadline;
    const byKind = (KIND_RANK.get(a.kind) ?? 0) - (KIND_RANK.get(b.kind) ?? 0);
    if (byKind !== 0) return byKind;
    return a.id.localeCompare(b.id);
  });
}
