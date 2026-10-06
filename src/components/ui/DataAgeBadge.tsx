import { useTranslation } from 'react-i18next';
import { formatAge, HOUR_MS, DAY_MS } from '@/lib/age';
import { formatTimestamp } from '@/lib/timestamp';
// A device-local display preference, the same class as `lib/fontScale.ts` —
// not feature logic and not a Dexie call, both of which a primitive must stay
// clear of. Read here rather than taken as a prop because every one of this
// badge's ~15 callers would otherwise have to thread the same global through.
import { useTimeZone } from '@/lib/timeFormat';
import { useTicker } from '@/lib/ticker';
import { Tooltip } from './Tooltip';

/** One shared 30 s clock for every badge on screen, not an interval each. */
const TICK_MS = 30_000;

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
  /**
   * Shows the badge below `md` too. For a surface where the age *is* the
   * content rather than header chrome competing with a title � the
   * Characters page's "Last synced" column and card dot.
   */
  alwaysVisible?: boolean;
  /**
   * `false` renders plain text with no tooltip and no tab stop. For a badge
   * inside a button (a `Disclosure`'s `trailing`), where a focusable trigger
   * would nest interactive content in a control; the age text still shows.
   */
  tooltip?: boolean;
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

/**
 * Relative age of API-derived data. Required on every ESI-backed view — but
 * hidden below `md`: on a phone-width header it was the thing crowding out
 * the title and actions, and Settings' Data Age tab carries the same
 * information for every view at once, so mobile loses nothing by dropping it
 * here (see docs/context/decisions for the write-up).
 */
export function DataAgeBadge({
  date,
  note,
  dotOnly = false,
  alwaysVisible = false,
  tooltip = true,
  className = '',
}: DataAgeBadgeProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const now = useTicker(TICK_MS);

  const ms = Math.max(0, now - date.getTime());
  const age = formatAge(ms, t);
  // `dotOnly` drops the age from the visible text but must not drop it
  // altogether — it moves to the front of the tooltip, and stays in the
  // accessible name as screen-reader text.
  const content = [dotOnly ? age : null, formatTimestamp(date, timeZone), note]
    .filter(Boolean)
    .join(' — ');

  const badge = (
    <time
      dateTime={date.toISOString()}
      // A tooltip trigger must take focus, or a keyboard reader never sees it.
      tabIndex={tooltip ? 0 : undefined}
      className={`items-center gap-1.5 text-[0.6875rem] tabular-nums ${
        alwaysVisible ? 'inline-flex' : 'hidden md:inline-flex'
      } ${toneFor(ms)} ${className}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {dotOnly ? <span className="sr-only">{age}</span> : age}
    </time>
  );

  return tooltip ? <Tooltip content={content}>{badge}</Tooltip> : badge;
}
