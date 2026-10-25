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
import { DEADLINE_SEVERITIES } from '../character/severity';
import { dayStart, nextDay, type DayZone } from '../localDay';
import type { CorpBoardItem } from './board';
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

/**
 * Severity worst-first, which is also `severityForRemaining`'s own order. Used
 * to reduce a day's items to the one colour its bar carries.
 */
/** Worst-first, from the shared ladder — not a second literal to keep in step. */
const SEVERITY_RANK: readonly CorpBoardSeverity[] = DEADLINE_SEVERITIES;

export interface DeadlineDay {
  /** Midnight this day starts at on the Time format clock (local, or UTC for EVE time) — the bar's identity and its label's source. */
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
 * Which day of the strip an item lands on, or `null` when it lands on none.
 *
 * Three rules, and each is a decision rather than a fallout:
 *
 * - `untimed` lands nowhere. An offline service is a standing fault with no
 *   instant at all, so counting it on any day would invent a deadline. Those
 *   items get their own surface instead (Structures' Problems only).
 * - `passed` lands on day 0. ESI drops `fuel_expires` once a structure runs
 *   dry, so there is no instant left to bucket — but the thing is outstanding
 *   *now*, which is exactly what day 0 means.
 * - An overdue but still-timed item also lands on day 0, not on the day it
 *   actually expired. The strip is a forward look at outstanding work; a bar
 *   in the past would be unreachable and would make the strip's own total
 *   disagree with what the cards show as still needing doing.
 */
function dayIndexFor(
  item: CorpBoardItem,
  strip: readonly DeadlineDay[],
  zone: DayZone
): number | null {
  if (item.timing === 'untimed') return null;
  if (item.timing === 'passed') return 0;
  if (item.deadlineMs === null) return null;

  // Matched on the day's own midnight, not by dividing a difference by 24h: a
  // local day is 23 or 25 hours long across a DST change.
  const startMs = dayStart(item.deadlineMs, zone);
  if (startMs < strip[0]!.startMs) return 0;
  const index = strip.findIndex((day) => day.startMs === startMs);
  return index === -1 ? null : index;
}

function worseOf(
  current: CorpBoardSeverity | null,
  candidate: CorpBoardSeverity
): CorpBoardSeverity {
  if (current === null) return candidate;
  return SEVERITY_RANK.indexOf(candidate) < SEVERITY_RANK.indexOf(current) ? candidate : current;
}

/**
 * One entry per day for `days` days starting today, however sparse. Days are
 * cut on `zone`'s clock: the machine's own when omitted, UTC for EVE time.
 *
 * Empty days are present and count zero, which is the point: the gaps are what
 * make a cluster legible, and a strip that only carried the days with work
 * would compress a quiet fortnight into a busy-looking row.
 */
export function deadlinesByDay(
  items: readonly CorpBoardItem[],
  nowMs: number,
  days: number = DEADLINE_STRIP_DAYS,
  zone?: DayZone
): DeadlineDay[] {
  const strip: DeadlineDay[] = [];
  let startMs = dayStart(nowMs, zone);
  for (let index = 0; index < Math.max(0, days); index += 1) {
    strip.push({ startMs, count: 0, severity: null });
    startMs = nextDay(startMs, zone);
  }
  if (strip.length === 0) return strip;

  for (const item of items) {
    const index = dayIndexFor(item, strip, zone);
    if (index === null) continue;
    const day = strip[index]!;
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
