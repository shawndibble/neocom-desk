/**
 * Derived reads over a built character board: day buckets for the Calendar
 * Map and the Day Ticker, day groups for the Coming Up Rail, and the kind
 * filter's two halves.
 *
 * Everything here **filters or buckets, and never re-sorts**. `board.ts` owns
 * the one ordering; a second ordering in here would be a second opinion about
 * urgency, which is the specific failure the corp board's scope decision rules
 * out. Every function takes the board already ordered and preserves that order
 * within whatever it groups.
 *
 * Pure (CLAUDE.md): no clock read here either — `nowMs` arrives as an
 * argument wherever "today" is a question.
 */

import type { DeadlineSeverity } from '../severity';
import { DEADLINE_SEVERITIES } from '../severity';
import type { CharacterBoardItem, CharacterBoardItemKind } from './board';
import { localMidnight, nextLocalDay } from '../localDay';

export { localMidnight };

/** What one day of the map or the ticker draws: how many, and how bad. */
export interface DayLoad {
  count: number;
  /** The worst severity landing on that day — one bad item may not hide behind four calm ones. */
  severity: DeadlineSeverity;
}

const SEVERITY_RANK = new Map<DeadlineSeverity, number>(
  DEADLINE_SEVERITIES.map((severity, index) => [severity, index])
);

function worse(a: DeadlineSeverity, b: DeadlineSeverity): DeadlineSeverity {
  return (SEVERITY_RANK.get(a) ?? 0) <= (SEVERITY_RANK.get(b) ?? 0) ? a : b;
}

/**
 * Keyed by local-midnight epoch ms, and **only for days that hold something**.
 *
 * A sparse map rather than a dense range: the map grid and the ticker each
 * decide their own span, and handing them a range would mean this module
 * agreeing with both about what "the next fortnight" is. They walk their own
 * days and look each one up.
 */
export function countsByDay(items: readonly CharacterBoardItem[]): Map<number, DayLoad> {
  const days = new Map<number, DayLoad>();
  for (const item of items) {
    const key = localMidnight(item.deadlineMs);
    const existing = days.get(key);
    if (existing) {
      existing.count += 1;
      existing.severity = worse(existing.severity, item.severity);
    } else {
      days.set(key, { count: 1, severity: item.severity });
    }
  }
  return days;
}

export interface DayGroup {
  dayStartMs: number;
  items: CharacterBoardItem[];
}

/**
 * The rail's day headings, in board order.
 *
 * Walks the already-ordered board and starts a new group whenever the local
 * day changes, so the groups come out chronological because the board was —
 * not because anything here sorted them again.
 */
export function groupByDay(items: readonly CharacterBoardItem[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const dayStartMs = localMidnight(item.deadlineMs);
    const current = groups[groups.length - 1];
    if (current && current.dayStartMs === dayStartMs) current.items.push(item);
    else groups.push({ dayStartMs, items: [item] });
  }
  return groups;
}

/**
 * Which of the three headings a day gets. The view owns the wording; this owns
 * the decision, because "is that tomorrow" is date arithmetic and date
 * arithmetic belongs in a tested engine rather than in a component.
 *
 * Calendar days, not a rolling 24 hours: at 23:30 the next half-hour is
 * tomorrow, and a group the user reads as dates must agree with the dates.
 */
export function relativeDayFor(dayStartMs: number, nowMs: number): 'today' | 'tomorrow' | 'other' {
  const today = localMidnight(nowMs);
  if (dayStartMs === today) return 'today';
  return dayStartMs === nextLocalDay(today) ? 'tomorrow' : 'other';
}

/**
 * The kind filter, applied.
 *
 * An empty selection returns nothing rather than everything. The filter's own
 * default holds every kind, so an empty set can only be a deliberate act — and
 * quietly reinterpreting it as "all" would leave the user unable to tell a
 * working filter from a broken one. The view owes them an explicit "no types
 * selected" instead.
 */
export function filterByKinds(
  items: readonly CharacterBoardItem[],
  kinds: ReadonlySet<CharacterBoardItemKind>
): CharacterBoardItem[] {
  return items.filter((item) => kinds.has(item.kind));
}

/**
 * How many of each kind the board holds, for the filter menu's counts.
 *
 * A kind with nothing in it is **absent** rather than zero, so the menu can
 * tell "read fine, none due" (this map plus `readableKinds`) from "never
 * readable" (neither) — collapsing them would put a confident `0` next to an
 * endpoint the Character was never allowed to ask about.
 */
export function countsByKind(
  items: readonly CharacterBoardItem[]
): Map<CharacterBoardItemKind, number> {
  const counts = new Map<CharacterBoardItemKind, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return counts;
}
