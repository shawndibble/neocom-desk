import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface DataAgeBadgeProps {
  /** When the data was last fetched. */
  date: Date;
  className?: string;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** BUG #8: age text was hardcoded English; routed through i18next (common.age.*). */
function formatAge(ms: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  if (ms < MIN) return t('common.age.justNow');
  if (ms < HOUR) return t('common.age.minutes', { count: Math.floor(ms / MIN) });
  if (ms < DAY) return t('common.age.hours', { count: Math.floor(ms / HOUR) });
  return t('common.age.days', { count: Math.floor(ms / DAY) });
}

function toneFor(ms: number): string {
  if (ms < HOUR) return 'text-text-dim';
  if (ms < DAY) return 'text-warning';
  return 'text-danger';
}

/** Relative age of API-derived data. Required on every ESI-backed view. */
export function DataAgeBadge({ date, className = '' }: DataAgeBadgeProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const ms = Math.max(0, now - date.getTime());

  return (
    <time
      dateTime={date.toISOString()}
      title={date.toLocaleString()}
      className={`inline-flex items-center gap-1.5 text-[0.6875rem] tabular-nums ${toneFor(ms)} ${className}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {formatAge(ms, t)}
    </time>
  );
}
