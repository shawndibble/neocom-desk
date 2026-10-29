import type { SkillQueueEntry } from '@/esi/endpoints';
import type { WeekStart } from '@/lib/calendarGrid';
import type { ClassifiedQueueEntry } from '@/engine/skills/queueStatus';
import { HOUR_MS, DAY_MS } from '@/lib/age';

/** A queue row plus how long it adds to the queue on its own. */
export interface QueueRowView extends ClassifiedQueueEntry {
  /** Seconds this level adds after the one before it; null when undated. */
  durationSeconds: number | null;
}

export interface QueuePeriodGroup {
  /** Stable key: `week`, `month` (the rest of this calendar month) or `YYYY-MM`. */
  id: string;
  /**
   * First of the calendar month (on the chosen clock) of a `YYYY-MM` group, as
   * UTC midnight of that date so it reads back the same in any zone; undefined
   * for week and month.
   */
  monthStart?: Date;
  rows: QueueRowView[];
  /** Time the group adds to the queue: the sum of its rows' own durations. */
  totalSeconds: number;
}

export interface QueueView {
  /** The level training now; null with nothing in flight (done, paused or empty). */
  hero: QueueRowView | null;
  /** Levels queued behind the hero, bucketed by when each finishes. */
  groups: QueuePeriodGroup[];
  /** Levels ESI still lists but that already finished (it keeps them until next login). */
  finished: ClassifiedQueueEntry[];
  /** Levels with no dates because the queue is paused. */
  undated: ClassifiedQueueEntry[];
  /** Seconds until the whole queue drains. */
  totalSeconds: number;
  /** Levels still ahead: training, waiting or paused. */
  skillCount: number;
}

/**
 * Which bucket a level finishing at `finishMs` belongs to: the rest of this
 * week (up to the next `weekStart`), the rest of this calendar month, then
 * one group per calendar month.
 */
function bucketOf(
  finishMs: number,
  nowMs: number,
  weekStart: WeekStart,
  timeZone: 'UTC' | undefined
): { id: string; monthStart?: Date } {
  const now = calendarDay(nowMs, timeZone);
  const finish = calendarDay(finishMs, timeZone);
  // Whole calendar days on the chosen clock, so DST never shifts a boundary.
  const weekOffset = (now.weekday - (weekStart === 'sunday' ? 0 : 1) + 7) % 7;
  if (finish.dayIndex < now.dayIndex - weekOffset + 7) return { id: 'week' };
  if (finish.year === now.year && finish.month === now.month) return { id: 'month' };
  const id = `${finish.year}-${String(finish.month + 1).padStart(2, '0')}`;
  return { id, monthStart: new Date(Date.UTC(finish.year, finish.month, 1)) };
}

/**
 * The calendar date of an instant on the chosen clock: the host zone, or UTC
 * (EVE time). `dayIndex` counts whole days so two dates subtract cleanly.
 */
function calendarDay(ms: number, timeZone: 'UTC' | undefined) {
  const d = new Date(ms);
  const utc = timeZone === 'UTC';
  const year = utc ? d.getUTCFullYear() : d.getFullYear();
  const month = utc ? d.getUTCMonth() : d.getMonth();
  const day = utc ? d.getUTCDate() : d.getDate();
  return {
    year,
    month,
    weekday: utc ? d.getUTCDay() : d.getDay(), // 0 = Sunday
    dayIndex: Date.UTC(year, month, day) / DAY_MS,
  };
}

/**
 * Shape the classified in-game queue for the Plans page: the level training
 * now, the rest grouped by when they finish, and what could not be placed.
 * Pure: every figure comes from the ESI dates already folded into
 * `secondsRemaining`, never recomputed from attributes (the page's own rule).
 */
export function buildQueueView(
  rows: readonly ClassifiedQueueEntry[],
  nowMs: number,
  weekStart: WeekStart,
  timeZone?: 'UTC'
): QueueView {
  const finished = rows.filter((r) => r.status === 'completed');
  const undated = rows.filter((r) => r.status === 'paused');
  const active = rows.filter((r) => r.status === 'training' || r.status === 'pending');

  let previous = 0;
  const dated: QueueRowView[] = active.map((r) => {
    const remaining = r.secondsRemaining ?? previous;
    const view = { ...r, durationSeconds: Math.max(0, remaining - previous) };
    previous = remaining;
    return view;
  });

  const hero = dated[0]?.status === 'training' ? dated[0] : null;
  const groups: QueuePeriodGroup[] = [];
  for (const row of hero ? dated.slice(1) : dated) {
    const bucket = bucketOf(nowMs + (row.secondsRemaining ?? 0) * 1000, nowMs, weekStart, timeZone);
    let group = groups.find((g) => g.id === bucket.id);
    if (!group) {
      group = { ...bucket, rows: [], totalSeconds: 0 };
      groups.push(group);
    }
    group.rows.push(row);
    group.totalSeconds += row.durationSeconds ?? 0;
  }

  return {
    hero,
    groups,
    finished,
    undated,
    totalSeconds: previous,
    skillCount: active.length + undated.length,
  };
}

function trainingWindow(entry: SkillQueueEntry): { start: number; end: number } | null {
  if (!entry.start_date || !entry.finish_date) return null;
  const start = Date.parse(entry.start_date);
  const end = Date.parse(entry.finish_date);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

/**
 * Share (0..1) of the level's SP already trained; null when paused. Reads the
 * SP span off ESI when it is there, so a level resumed part-way (or a high
 * rank skill) isn't reported as just the elapsed share of its last window.
 */
export function heroProgress(entry: SkillQueueEntry, nowMs: number): number | null {
  const w = trainingWindow(entry);
  if (!w) return null;
  const elapsed = Math.min(1, Math.max(0, (nowMs - w.start) / (w.end - w.start)));
  const {
    level_start_sp: levelStart,
    training_start_sp: windowStart,
    level_end_sp: levelEnd,
  } = entry;
  if (levelStart === undefined || windowStart === undefined || levelEnd === undefined)
    return elapsed;
  if (levelEnd <= levelStart) return elapsed;
  const nowSp = windowStart + elapsed * (levelEnd - windowStart);
  return Math.min(1, Math.max(0, (nowSp - levelStart) / (levelEnd - levelStart)));
}

/**
 * SP per hour the level is training at, read off ESI's own window and SP
 * span, so it already reflects attributes, implants and clone state.
 */
export function heroSpPerHour(entry: SkillQueueEntry): number | null {
  const w = trainingWindow(entry);
  if (!w || entry.training_start_sp === undefined || entry.level_end_sp === undefined) return null;
  const hours = (w.end - w.start) / HOUR_MS;
  return (entry.level_end_sp - entry.training_start_sp) / hours;
}
