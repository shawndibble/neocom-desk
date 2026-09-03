/**
 * The relative-age ladder shared by every surface that shows "how long ago".
 * Extracted from `DataAgeBadge` so the Notification Feed's fired-at stamps
 * read identically to a Data Age without duplicating the thresholds — the
 * badge adds a staleness *tone* on top of this, which a fired notification
 * deliberately does not (an old notification is old, not wrong).
 */
export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

type Translate = (key: string, opts?: Record<string, unknown>) => string;

export function formatAge(ms: number, t: Translate): string {
  if (ms < MINUTE_MS) return t('common.age.justNow');
  if (ms < HOUR_MS) return t('common.age.minutes', { count: Math.floor(ms / MINUTE_MS) });
  if (ms < DAY_MS) return t('common.age.hours', { count: Math.floor(ms / HOUR_MS) });
  return t('common.age.days', { count: Math.floor(ms / DAY_MS) });
}
