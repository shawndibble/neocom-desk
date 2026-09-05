import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatAge, HOUR_MS, DAY_MS } from '@/lib/age';

interface DataAgeBadgeProps {
  /** When the data was last fetched. */
  date: Date;
  /**
   * A sentence about *this* view's refresh cadence, appended to the tooltip
   * after the absolute timestamp.
   *
   * Off by default, because for most views the age and the app-wide ten-minute
   * promise say everything. It exists for the surfaces where they do not: CCP
   * caches corp data for about an hour, and a board of countdowns has to say so
   * rather than let the amber tone imply something is wrong (issue #296).
   */
  note?: string;
  /**
   * Renders only the dot — no visible relative-age text — with the age
   * moved into the tooltip instead of dropped. For a spot where the text
   * itself is the thing crowding a tight row (a character card's header,
   * say): the staleness signal (dot + tone) stays, on hover/focus the exact
   * age is still there, and the layout doesn't pay for it.
   */
  dotOnly?: boolean;
  className?: string;
}

/**
 * The staleness tone is this badge's own concern; the age *text* comes from
 * the shared ladder in `lib/age.ts` (BUG #8 routed it through i18next).
 */
function toneFor(ms: number): string {
  if (ms < HOUR_MS) return 'text-text-dim';
  if (ms < DAY_MS) return 'text-warning';
  return 'text-danger';
}

/** Relative age of API-derived data. Required on every ESI-backed view. */
export function DataAgeBadge({ date, note, dotOnly = false, className = '' }: DataAgeBadgeProps) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const ms = Math.max(0, now - date.getTime());
  const age = formatAge(ms, t);
  // `dotOnly` drops the age from the visible text but must not drop it
  // altogether — it moves to the front of the tooltip instead.
  const title = [dotOnly ? age : null, date.toLocaleString(), note].filter(Boolean).join(' — ');

  return (
    <time
      dateTime={date.toISOString()}
      title={title}
      className={`inline-flex items-center gap-1.5 text-[0.6875rem] tabular-nums ${toneFor(ms)} ${className}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {!dotOnly && age}
    </time>
  );
}
