/**
 * The two derived reads the reworked `/corp` overview needs from a board that
 * is no longer rendered as one flat list (issue #566).
 *
 * `board.ts` still does the ranking, and it is still the only ranking — this
 * module never re-sorts anything. What it adds is *shape*: how many clocks land
 * on each of the coming days, and how many land inside the next day. Grouping
 * the board by kind is what costs a manager the single merged ordering, and
 * these two functions are what pay it back (see the scope decision for #566).
 *
 * Pure like the rest of `src/engine` (CLAUDE.md): board items and `nowMs` in,
 * plain objects out.
 */
import { CORP_BOARD_ITEM_KINDS, type CorpBoardItem, type CorpBoardItemKind } from './board';
import type { CorpBoardSeverity } from './board';

/** How far ahead the Deadline Strip looks on a full-width viewport. */
export const DEADLINE_STRIP_DAYS = 14;

/**
 * The window "due soon" means for the Standing panel's first figure.
 *
 * One day, not the engine's own `critical` threshold: this figure answers "is
 * there anything I have to do before I next log in", which is a question about
 * the calendar, not about the severity ladder.
 */
export const DUE_SOON_WINDOW_MS = 86_400_000;

const DAY_MS = 86_400_000;

/**
 * Severity worst-first, which is also `severityForRemaining`'s own order. Used
 * to reduce a day's items to the one colour its bar carries.
 */
const SEVERITY_RANK: readonly CorpBoardSeverity[] = ['critical', 'warning', 'watch', 'clear'];

export interface DeadlineDay {
  /** Local midnight this day starts at — the bar's identity and its label's source. */
  startMs: number;
  /** How many board items fall due on this day. */
  count: number;
  /** The worst severity landing on this day, or `null` when nothing does. */
  severity: CorpBoardSeverity | null;
}

export interface DueSoonCount {
  /** Everything outstanding inside the window, overdue items included. */
  total: number;
  /**
   * How many of those are already behind us.
   *
   * Reported separately rather than folded in: "7 due in 24h" and "7 due in
   * 24h, 1 of them already late" are different situations, and the second is
   * the one that needs acting on first.
   */
  overdue: number;
}

/**
 * Local midnight beginning the day `ms` falls in.
 *
 * Local, not UTC, because the strip's labels are weekdays and calendar dates —
 * a manager reads "Tuesday", and a UTC bucket would put a Tuesday-evening
 * timer on Wednesday for anyone west of Greenwich. `Date`'s local getters are
 * the only way to ask this question, so the function is impure with respect to
 * the machine's zone and deliberately takes no zone argument: the caller's own
 * clock *is* the answer here.
 */
function localMidnight(ms: number): number {
  const date = new Date(ms);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * Which day of the strip an item lands on, or `null` when it lands on none.
 *
 * Three rules, and each is a decision rather than a fallout:
 *
 * - `untimed` lands nowhere. An offline service is a standing fault with no
 *   instant at all, so counting it on any day would invent a deadline. Those
 *   items get their own surface instead (`Offline services`).
 * - `passed` lands on day 0. ESI drops `fuel_expires` once a structure runs
 *   dry, so there is no instant left to bucket — but the thing is outstanding
 *   *now*, which is exactly what day 0 means.
 * - An overdue but still-timed item also lands on day 0, not on the day it
 *   actually expired. The strip is a forward look at outstanding work; a bar
 *   in the past would be unreachable and would make the strip's own total
 *   disagree with what the cards show as still needing doing.
 */
function dayIndexFor(item: CorpBoardItem, dayZeroStartMs: number, days: number): number | null {
  if (item.timing === 'untimed') return null;
  if (item.timing === 'passed') return 0;
  if (item.deadlineMs === null) return null;

  // `round`, not `floor`: a DST boundary makes a local day 23 or 25 hours long,
  // so the difference between two local midnights is not always a whole
  // multiple of 24h. Rounding lands on the right day either way.
  const index = Math.round((localMidnight(item.deadlineMs) - dayZeroStartMs) / DAY_MS);
  if (index < 0) return 0;
  return index < days ? index : null;
}

function worseOf(
  current: CorpBoardSeverity | null,
  candidate: CorpBoardSeverity
): CorpBoardSeverity {
  if (current === null) return candidate;
  return SEVERITY_RANK.indexOf(candidate) < SEVERITY_RANK.indexOf(current) ? candidate : current;
}

/**
 * One entry per day for `days` days starting today, however sparse.
 *
 * Empty days are present and count zero, which is the point: the gaps are what
 * make a cluster legible, and a strip that only carried the days with work
 * would compress a quiet fortnight into a busy-looking row.
 */
export function deadlinesByDay(
  items: readonly CorpBoardItem[],
  nowMs: number,
  days: number = DEADLINE_STRIP_DAYS
): DeadlineDay[] {
  const dayZeroStartMs = localMidnight(nowMs);
  const strip: DeadlineDay[] = Array.from({ length: Math.max(0, days) }, (_, index) => ({
    // Built from local calendar arithmetic rather than `dayZeroStartMs + index *
    // DAY_MS`, so a DST change does not drift the later labels by an hour.
    startMs: localMidnight(dayZeroStartMs + index * DAY_MS + DAY_MS / 2),
    count: 0,
    severity: null,
  }));

  for (const item of items) {
    const index = dayIndexFor(item, dayZeroStartMs, strip.length);
    if (index === null) continue;
    const day = strip[index];
    day.count += 1;
    day.severity = worseOf(day.severity, item.severity);
  }
  return strip;
}

/**
 * How much is outstanding inside `windowMs`, and how much of it is already late.
 *
 * Counts the same items the strip's day 0 (and, for a 24h window, only day 0)
 * would: `untimed` is excluded because it has no deadline to be inside a
 * window, and `passed` is included because a structure that is already dry is
 * as outstanding as work gets.
 */
export function dueSoon(
  items: readonly CorpBoardItem[],
  nowMs: number,
  windowMs: number = DUE_SOON_WINDOW_MS
): DueSoonCount {
  let total = 0;
  let overdue = 0;
  for (const item of items) {
    if (item.timing === 'untimed') continue;
    if (item.timing === 'passed') {
      total += 1;
      overdue += 1;
      continue;
    }
    if (item.deadlineMs === null) continue;
    if (item.deadlineMs - nowMs > windowMs) continue;
    total += 1;
    if (item.deadlineMs <= nowMs) overdue += 1;
  }
  return { total, overdue };
}

/**
 * The board split by kind, in `CORP_BOARD_ITEM_KINDS` order, each group keeping
 * the order the board gave it.
 *
 * A `Map` rather than a `Record` so the iteration order is the declared kind
 * order and not an object-key accident, and so a kind with nothing due is
 * simply absent — the view needs "no rows" and "no card" to stay different
 * answers, and it decides which one applies from the Corp Capability, never
 * from this.
 */
export function groupBoardByKind(
  items: readonly CorpBoardItem[]
): Map<CorpBoardItemKind, CorpBoardItem[]> {
  const grouped = new Map<CorpBoardItemKind, CorpBoardItem[]>();
  for (const kind of CORP_BOARD_ITEM_KINDS) {
    const forKind = items.filter((item) => item.kind === kind);
    if (forKind.length > 0) grouped.set(kind, forKind);
  }
  return grouped;
}
