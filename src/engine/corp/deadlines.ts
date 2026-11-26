import { DEADLINE_SEVERITIES } from '../character/severity';
import { dayStart, nextDay, type DayZone } from '../localDay';
import type { CorpBoardItem } from './board';
import type { CorpBoardSeverity } from './board';
import { DAY_MS } from '@/lib/age';

export const DEADLINE_STRIP_DAYS = 14;

export const DUE_SOON_WINDOW_MS = DAY_MS;

const SEVERITY_RANK: readonly CorpBoardSeverity[] = DEADLINE_SEVERITIES;

export interface DeadlineDay {
  startMs: number;
  count: number;
  severity: CorpBoardSeverity | null;
}

export interface DueSoonCount {
  total: number;
  overdue: number;
}

function dayIndexFor(
  item: CorpBoardItem,
  strip: readonly DeadlineDay[],
  zone: DayZone
): number | null {
  if (item.timing === 'untimed') return null;
  if (item.timing === 'passed') return 0;
  if (item.deadlineMs === null) return null;

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
