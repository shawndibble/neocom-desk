/**
 * Shared Pops on the Calendar (issue #6224; scope: docs/context/decisions/
 * 20261115-122511-corp-tax-book-shares-moon-pop-schedules.md): the "Shared moon pop" Clock Kind,
 * as board rows. Pure: the read and the names come from `calendarSharedPopsRead.ts`; the detail
 * and its Survey start link are `sharedPopDetail.ts` (kept out of the boot graph: the start link
 * module reaches Firebase).
 *
 * A Shared Pop shows from its Extraction's start until its retention ends (three days past the
 * belt's expiry). Before the Pop Time the row counts down to it; after, to the belt's expiry, so
 * a late fleet still sees the field (the `moonChunk` arrival-then-decay pattern); past it the row
 * is overdue until someone marks the moon finished. A moon the pilot already reads as a corp
 * `moonChunk` row (ESI or their own book) is left out: that row wins. A Calendar event that is
 * the same fleet (`dropEventsOfSharedPops`) is left out instead, so the pop is the one row.
 */
import type {
  BoardCalendarEventSource,
  BoardClockSource,
  BoardCorporation,
} from '@/engine/character/board';
import { MINUTE_MS } from '@/lib/age';
import type { SharedPopView } from '@/sync/sharedPops';

/** One Shared Pop with every name it shows already resolved. Plain data: the route snapshot keeps it. */
export interface SharedPopEntry {
  pop: SharedPopView;
  moonName: string | null;
  corporation: BoardCorporation;
  /** The ore make-up by name, when the book shares it. Never ISK. */
  ore: { name: string; quantity: number }[] | null;
  /** The linked Survey's state, read by the Calendar's load; absent with no Survey or no read. */
  survey?: SharedPopSurvey;
}

export interface SharedPopSurvey {
  finished: boolean;
  /** Whole percent of the field still unmined. */
  percentLeft: number;
}

/** Which Pop Time the viewer's Calendar shows: the officer's choice, or one of the two. */
export type SharedPopTimePref = 'asShared' | 'ready' | 'autoFracture';

type PopTimeKey = 'ready' | 'autoFracture';

/** The row's and the modal's title: the refinery (it carries the system), else the moon. */
export function sharedPopTitle(entry: SharedPopEntry): string {
  return entry.pop.refineryName ?? entry.moonName ?? `#${entry.pop.structureId}`;
}

/** Shown between the Extraction's start and `retainUntil` (an older doc: the belt's expiry). */
export function sharedPopIsShown(pop: SharedPopView, nowMs: number): boolean {
  const start = Date.parse(pop.startedAt);
  const end = Date.parse(pop.retainUntil ?? pop.expiresAt);
  return start <= nowMs && nowMs < end;
}

/**
 * The Pop Times a pop can show, in ms. A fractured chunk has one actual time; a pop published
 * before both instants existed has only `popAt`, read as the officer's choice.
 */
function popTimes(pop: SharedPopView): { ready: number; autoFracture: number } {
  const popAt = Date.parse(pop.popAt);
  if (pop.fractured) return { ready: popAt, autoFracture: popAt };
  const asKey = pop.popTime === 'ready' ? 'ready' : 'autoFracture';
  const ready = pop.readyAt === undefined ? NaN : Date.parse(pop.readyAt);
  const autoFracture = pop.autoFractureAt === undefined ? NaN : Date.parse(pop.autoFractureAt);
  return {
    ready: Number.isNaN(ready) ? (asKey === 'ready' ? popAt : NaN) : ready,
    autoFracture: Number.isNaN(autoFracture)
      ? asKey === 'autoFracture'
        ? popAt
        : NaN
      : autoFracture,
  };
}

/** The Pop Time the viewer's setting picks, falling back to the officer's when it is unknown. */
function shownKey(pop: SharedPopView, pref: SharedPopTimePref): PopTimeKey {
  const officer: PopTimeKey = pop.popTime === 'ready' ? 'ready' : 'autoFracture';
  if (pref === 'asShared' || pop.fractured) return officer;
  return Number.isNaN(popTimes(pop)[pref]) ? officer : pref;
}

/** The instant the pop shows at under the viewer's setting. */
export function sharedPopShownAtMs(pop: SharedPopView, pref: SharedPopTimePref): number {
  const at = popTimes(pop)[shownKey(pop, pref)];
  return Number.isNaN(at) ? Date.parse(pop.popAt) : at;
}

/**
 * The instant a Shared Pop's row is due: its Pop Time, or once popped the belt's expiry. The
 * day a `?pop=` deep link moves the map to (issue #6239). NaN when the Pop Time is unreadable.
 */
export function sharedPopDeadlineMs(
  pop: SharedPopView,
  nowMs: number,
  pref: SharedPopTimePref = 'asShared'
): number {
  const shownAt = sharedPopShownAtMs(pop, pref);
  return nowMs >= shownAt ? Date.parse(pop.expiresAt) : shownAt;
}

/**
 * Whether the moon is known finished or guessed so. Finished is an officer's Fully Mined flag or
 * a finished linked Survey; "likely mined out" is the server's ledger guess and never overrides
 * the clock. Null for a moon nobody has said anything about.
 */
export function sharedPopMiningState(
  entry: SharedPopEntry
): 'fullyMined' | 'likelyMinedOut' | null {
  if (entry.pop.fullyMined !== undefined || entry.survey?.finished) return 'fullyMined';
  return entry.pop.likelyMinedOut ? 'likelyMinedOut' : null;
}

/**
 * The Calendar rows. `readableRefineries` are the refineries the pilot already reads as corp
 * moon chunks: those pops are left out. One refinery holds one moon's drill at a time.
 */
export function toSharedPopSources(
  entries: readonly SharedPopEntry[],
  readableRefineries: ReadonlySet<number>,
  nowMs: number,
  pref: SharedPopTimePref = 'asShared'
): BoardClockSource[] {
  const sources: BoardClockSource[] = [];
  for (const entry of entries) {
    const { pop } = entry;
    if (!sharedPopIsShown(pop, nowMs) || readableRefineries.has(pop.structureId)) continue;
    const shownAtMs = sharedPopShownAtMs(pop, pref);
    if (Number.isNaN(shownAtMs)) continue;
    const popped = nowMs >= shownAtMs;
    // A guess shows only once popped; it labels the row and never replaces the clock's detail.
    const mining = sharedPopMiningState(entry);
    const fullyMined = mining === 'fullyMined';
    const likelyMinedOut = mining === 'likelyMinedOut' && popped;
    const key = shownKey(pop, pref);
    const otherKey: PopTimeKey = key === 'ready' ? 'autoFracture' : 'ready';
    const otherAtMs = popTimes(pop)[otherKey];
    const detail = fullyMined
      ? 'fullyMined'
      : nowMs >= Date.parse(pop.expiresAt)
        ? 'expired'
        : popped
          ? 'expires'
          : key;
    sources.push({
      id: pop.id,
      subject: sharedPopTitle(entry),
      detail,
      deadlineMs: sharedPopDeadlineMs(pop, nowMs, pref),
      sharedBy: entry.corporation,
      // The other Pop Time, until the pop pops: afterwards the belt's expiry is the news.
      ...(!popped && !pop.fractured && !Number.isNaN(otherAtMs) && otherAtMs !== shownAtMs
        ? { extra: { detail: otherKey, atMs: otherAtMs } }
        : likelyMinedOut
          ? { extra: { detail: 'likelyMinedOut' } }
          : {}),
      ...(fullyMined ? { pastLabelKey: 'calendar.fullyMined' } : {}),
    });
  }
  return sources;
}

/** A title's words: lower-cased letters and digits, so "Ainsan - Foil" and "ainsan foil" agree. */
const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/** How far a Calendar event's start may sit from a pop's time and still be that pop. */
export const POP_EVENT_MATCH_MS = 5 * MINUTE_MS;

/**
 * The Calendar events with those a Shared Pop already shows taken out: the corp put the same
 * fleet in the in-game calendar. An event is that fleet when it starts within five minutes of
 * either of the pop's times (so the viewer's choice never brings it back) and every word of its
 * title is in the refinery's or the moon's name. Only a pop that is on the board counts.
 */
export function dropEventsOfSharedPops<T extends BoardCalendarEventSource>(
  events: readonly T[],
  entries: readonly SharedPopEntry[],
  readableRefineries: ReadonlySet<number>,
  nowMs: number,
  pref: SharedPopTimePref
): T[] {
  const pops = entries
    .filter((e) => sharedPopIsShown(e.pop, nowMs) && !readableRefineries.has(e.pop.structureId))
    .map((e) => {
      const times = popTimes(e.pop);
      return {
        words: new Set(wordsOf(`${e.pop.refineryName ?? ''} ${e.moonName ?? ''}`)),
        times: [times.ready, times.autoFracture, sharedPopShownAtMs(e.pop, pref)].filter(
          (ms) => !Number.isNaN(ms)
        ),
      };
    });
  return events.filter((event) => {
    const words = wordsOf(event.subject);
    if (words.length === 0) return true;
    return !pops.some(
      (pop) =>
        words.every((word) => pop.words.has(word)) &&
        pop.times.some((ms) => Math.abs(event.deadlineMs - ms) <= POP_EVENT_MATCH_MS)
    );
  });
}
