import type { CharacterBoardItem, CharacterBoardItemKind } from './board';
import { CHARACTER_BOARD_ITEM_KINDS } from './board';
import { DAY_MS } from '@/lib/age';
import { dayStart, localMidnight, nextDay, type DayZone } from '../localDay';

export { localMidnight };

export interface DayLoad {
  count: number;
  kinds: CharacterBoardItemKind[];
}

export function countsByDay(
  items: readonly CharacterBoardItem[],
  zone?: DayZone
): Map<number, DayLoad> {
  const seen = new Map<number, { count: number; kinds: Set<CharacterBoardItemKind> }>();
  for (const item of items) {
    const key = dayStart(item.deadlineMs, zone);
    const existing = seen.get(key);
    if (existing) {
      existing.count += 1;
      existing.kinds.add(item.kind);
    } else {
      seen.set(key, { count: 1, kinds: new Set([item.kind]) });
    }
  }

  const days = new Map<number, DayLoad>();
  for (const [key, { count, kinds }] of seen) {
    days.set(key, { count, kinds: CHARACTER_BOARD_ITEM_KINDS.filter((kind) => kinds.has(kind)) });
  }
  return days;
}

export interface DayGroup {
  dayStartMs: number;
  items: CharacterBoardItem[];
}

export function groupByDay(items: readonly CharacterBoardItem[], zone?: DayZone): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const item of items) {
    const dayStartMs = dayStart(item.deadlineMs, zone);
    const current = groups[groups.length - 1];
    if (current && current.dayStartMs === dayStartMs) current.items.push(item);
    else groups.push({ dayStartMs, items: [item] });
  }
  return groups;
}

export function splitOverdueBeforeToday(
  items: readonly CharacterBoardItem[],
  nowMs: number,
  zone: DayZone
): { beforeToday: CharacterBoardItem[]; rest: CharacterBoardItem[] } {
  const todayStartMs = dayStart(nowMs, zone);
  const beforeToday: CharacterBoardItem[] = [];
  const rest: CharacterBoardItem[] = [];
  for (const item of items)
    (item.remainingMs <= 0 && item.deadlineMs < todayStartMs ? beforeToday : rest).push(item);
  return { beforeToday, rest };
}

export function calendarDaysBefore(deadlineMs: number, nowMs: number, zone: DayZone): number {
  return Math.round((dayStart(nowMs, zone) - dayStart(deadlineMs, zone)) / DAY_MS);
}

export function relativeDayFor(
  dayStartMs: number,
  nowMs: number,
  zone?: DayZone
): 'today' | 'tomorrow' | 'other' {
  const today = dayStart(nowMs, zone);
  if (dayStartMs === today) return 'today';
  return dayStartMs === nextDay(today, zone) ? 'tomorrow' : 'other';
}

export function filterByKinds(
  items: readonly CharacterBoardItem[],
  kinds: ReadonlySet<CharacterBoardItemKind>
): CharacterBoardItem[] {
  return items.filter((item) => kinds.has(item.kind));
}

export function countsByKind(
  items: readonly CharacterBoardItem[]
): Map<CharacterBoardItemKind, number> {
  const counts = new Map<CharacterBoardItemKind, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  return counts;
}

export type CorpEventFilter = 'all' | 'none' | number;

export function filterByCorporation(
  items: readonly CharacterBoardItem[],
  filter: CorpEventFilter
): CharacterBoardItem[] {
  return byCorporationField(items, filter, (item) => item.corporation);
}

export function filterBySharingCorporation(
  items: readonly CharacterBoardItem[],
  filter: CorpEventFilter
): CharacterBoardItem[] {
  return byCorporationField(items, filter, (item) => item.sharedBy);
}

function byCorporationField(
  items: readonly CharacterBoardItem[],
  filter: CorpEventFilter,
  field: (item: CharacterBoardItem) => { id: number } | undefined
): CharacterBoardItem[] {
  if (filter === 'all') return [...items];
  return items.filter((item) => {
    const corporation = field(item);
    return corporation === undefined || corporation.id === filter;
  });
}
