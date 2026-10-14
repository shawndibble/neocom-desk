import type { SkillQueueEntry } from '@/esi/endpoints';
import type { ClassifiedQueueEntry } from '../queueStatus';

/** A queue row plus how long it adds to the queue on its own. */
export interface QueueRowView extends ClassifiedQueueEntry {
  /** Seconds this level adds after the one before it; null when undated. */
  durationSeconds: number | null;
}

export interface QueuePeriodGroup {
  /** Stable key, also the i18n variant: `week`, `weeks`, `month2` or `months-<first month>`. */
  id: string;
  /** First month of a `months-<n>` window (it spans two); undefined for the fixed buckets. */
  firstMonth?: number;
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

const DAY_SECONDS = 86_400;
const MONTH_DAYS = 30;

/** Which bucket a level finishing `days` from now belongs to. */
function bucketOf(days: number): { id: string; firstMonth?: number } {
  if (days <= 7) return { id: 'week' };
  if (days <= 28) return { id: 'weeks' };
  if (days <= 2 * MONTH_DAYS) return { id: 'month2' };
  // Two-month windows from month 3: 60-120d, 120-180d, ...
  const window = Math.floor((days - 2 * MONTH_DAYS) / (2 * MONTH_DAYS));
  const firstMonth = 3 + 2 * window;
  return { id: `months-${firstMonth}`, firstMonth };
}

/**
 * Shape the classified in-game queue for the Plans page: the level training
 * now, the rest grouped by when they finish, and what could not be placed.
 * Pure: every figure comes from the ESI dates already folded into
 * `secondsRemaining`, never recomputed from attributes (the page's own rule).
 */
export function buildQueueView(rows: readonly ClassifiedQueueEntry[]): QueueView {
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
    const bucket = bucketOf((row.secondsRemaining ?? 0) / DAY_SECONDS);
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

function window(entry: SkillQueueEntry): { start: number; end: number } | null {
  if (!entry.start_date || !entry.finish_date) return null;
  const start = Date.parse(entry.start_date);
  const end = Date.parse(entry.finish_date);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

/** Share (0..1) of the level's own training window already elapsed; null when paused. */
export function heroProgress(entry: SkillQueueEntry, nowMs: number): number | null {
  const w = window(entry);
  if (!w) return null;
  return Math.min(1, Math.max(0, (nowMs - w.start) / (w.end - w.start)));
}

/**
 * SP per hour the level is training at, read off ESI's own window and SP
 * span, so it already reflects attributes, implants and clone state.
 */
export function heroSpPerHour(entry: SkillQueueEntry): number | null {
  const w = window(entry);
  if (!w || entry.training_start_sp === undefined || entry.level_end_sp === undefined) return null;
  const hours = (w.end - w.start) / 3_600_000;
  return (entry.level_end_sp - entry.training_start_sp) / hours;
}
