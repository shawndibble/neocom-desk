import type { SkillQueueEntry } from '@/esi/endpoints';
import type { WeekStart } from '@/lib/calendarGrid';
import type { ClassifiedQueueEntry } from '@/engine/skills/queueStatus';
import { HOUR_MS, DAY_MS } from '@/lib/age';

export interface QueueRowView extends ClassifiedQueueEntry {
  durationSeconds: number | null;
}

export interface QueuePeriodGroup {
  id: string;
  monthStart?: Date;
  rows: QueueRowView[];
  totalSeconds: number;
}

export interface QueueView {
  hero: QueueRowView | null;
  groups: QueuePeriodGroup[];
  finished: ClassifiedQueueEntry[];
  undated: ClassifiedQueueEntry[];
  totalSeconds: number;
  skillCount: number;
}

function bucketOf(
  finishMs: number,
  nowMs: number,
  weekStart: WeekStart,
  timeZone: 'UTC' | undefined
): { id: string; monthStart?: Date } {
  const now = calendarDay(nowMs, timeZone);
  const finish = calendarDay(finishMs, timeZone);
  const weekOffset = (now.weekday - (weekStart === 'sunday' ? 0 : 1) + 7) % 7;
  if (finish.dayIndex < now.dayIndex - weekOffset + 7) return { id: 'week' };
  if (finish.year === now.year && finish.month === now.month) return { id: 'month' };
  const id = `${finish.year}-${String(finish.month + 1).padStart(2, '0')}`;
  return { id, monthStart: new Date(Date.UTC(finish.year, finish.month, 1)) };
}

function calendarDay(ms: number, timeZone: 'UTC' | undefined) {
  const d = new Date(ms);
  const utc = timeZone === 'UTC';
  const year = utc ? d.getUTCFullYear() : d.getFullYear();
  const month = utc ? d.getUTCMonth() : d.getMonth();
  const day = utc ? d.getUTCDate() : d.getDate();
  return {
    year,
    month,
    weekday: utc ? d.getUTCDay() : d.getDay(),
    dayIndex: Date.UTC(year, month, day) / DAY_MS,
  };
}

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

export function heroSpPerHour(entry: SkillQueueEntry): number | null {
  const w = trainingWindow(entry);
  if (!w || entry.training_start_sp === undefined || entry.level_end_sp === undefined) return null;
  const hours = (w.end - w.start) / HOUR_MS;
  return (entry.level_end_sp - entry.training_start_sp) / hours;
}
