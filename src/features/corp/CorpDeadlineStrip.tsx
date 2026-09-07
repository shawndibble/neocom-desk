/**
 * The Deadline Strip: one bar per day, counting what falls due on it.
 *
 * This is the compensation for grouping the board by kind (issue #566). Four
 * Kind Cards can each show a calm top three while, between them, they hide a
 * bad Tuesday — the merged single ordering used to make that impossible to
 * miss. The strip restores it as a shape rather than as a list: every clock the
 * Character can read, bucketed by the day it lands on, coloured by the worst
 * severity landing there.
 *
 * **CSS bars, not an SVG chart.** The first draft was one `viewBox` scaled to
 * the container, which is how a chart normally gets to be responsive — and it
 * put 12px labels through a 0.26 scale factor on a phone, rendering every count
 * at about three pixels. Percentage-height divs keep the labels as ordinary DOM
 * text at ordinary sizes, so the type scale means what it says at every width.
 * No chart library either: fourteen bars, a hairline baseline and direct labels
 * need none, and this project has no charting dependency to reach for.
 *
 * The counts sit on the bars, which is what lets the y-axis go away entirely —
 * a fortnight whose tallest day is 7 does not need a scale, it needs the
 * numbers.
 */
import { useTranslation } from 'react-i18next';
import { SEVERITY_STYLE } from '@/components/ui';
import { useIsNarrow } from '@/lib/useIsNarrow';
import type { DeadlineDay } from '@/engine/corp/deadlines';
import type { CorpBoardSeverity } from '@/engine/corp/board';

interface CorpDeadlineStripProps {
  /**
   * One entry per day, already bucketed by `deadlinesByDay`. No `nowMs`: every
   * time decision was made in the engine, and a second clock reading here could
   * only disagree with it.
   */
  days: readonly DeadlineDay[];
}

/**
 * Severity to bar fill — the same four tokens `SEVERITY_TONE` colours a row
 * with in `CorpBoardRow.tsx`, as background utilities so the tokens stay the
 * single source.
 */
const SEVERITY_FILL: Record<CorpBoardSeverity, string> = {
  critical: 'bg-danger',
  warning: 'bg-warning',
  watch: 'bg-accent',
  clear: 'bg-text-dim',
};

/* Names come from the shared ladder (`components/ui/severityTone.ts`) — this
   strip's own copy predated the Overview board wanting the same four words. */

const LEGEND_ORDER: readonly CorpBoardSeverity[] = ['critical', 'warning', 'watch', 'clear'];

/**
 * How far ahead a phone looks (AC6).
 *
 * Fourteen columns in 320px is 22px each, narrower than the `8 Sep` label under
 * them. A week is the most a phone can label honestly, and the footnote says
 * which window is on screen either way.
 */
const NARROW_DAYS = 7;

/** Shortest a non-zero bar may draw, so a count of 1 is still a mark. */
const MIN_BAR_PERCENT = 12;

export function CorpDeadlineStrip({ days: allDays }: CorpDeadlineStripProps) {
  const { t, i18n } = useTranslation();
  const isNarrow = useIsNarrow();

  // Sliced rather than re-bucketed: the engine already answered for the whole
  // fortnight, and a prefix of that cannot disagree with the wider view.
  const days = isNarrow ? allDays.slice(0, NARROW_DAYS) : allDays;

  if (days.length === 0) return null;

  const busiest = days.reduce((max, day) => Math.max(max, day.count), 0);
  const total = days.reduce((sum, day) => sum + day.count, 0);

  const weekday = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
  const dayMonth = new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short' });

  /**
   * The alt text *is* the strip. A bar chart is not readable by a screen reader
   * whatever its markup, so `role="img"` plus one sentence naming every day
   * with something on it is the accessible equivalent — and, unlike a table
   * nobody maintains, it cannot drift from what is drawn.
   */
  const described = days
    .filter((day) => day.count > 0)
    .map((day) =>
      t('corp.standing.strip.describeDay', {
        day: dayMonth.format(day.startMs),
        count: day.count,
        severity: t(SEVERITY_STYLE[day.severity ?? 'clear'].labelKey),
      })
    )
    .join('; ');

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
          {t('corp.standing.strip.title', { days: days.length })}
        </h3>
        {/*
          A legend for the four severities, not for a series: the strip draws one
          measure, so nothing here identifies a line. It exists because colour is
          never the only signal (DESIGN.md §7) — the same four words appear on
          the card rows below, and this is where the bar colours get named.
        */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {LEGEND_ORDER.map((severity) => (
            <span
              key={severity}
              className="inline-flex items-center gap-1.5 text-[0.6875rem] text-text-dim"
            >
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-[1px] ${SEVERITY_FILL[severity]}`}
              />
              {t(SEVERITY_STYLE[severity].labelKey)}
            </span>
          ))}
        </div>
      </div>

      <div
        role="img"
        aria-label={
          total === 0
            ? t('corp.standing.strip.describeEmpty', { days: days.length })
            : t('corp.standing.strip.describe', { days: days.length, detail: described })
        }
        className="flex items-end gap-0.5"
      >
        {days.map((day, index) => {
          const isToday = index === 0;
          const percent =
            day.count === 0 ? 0 : Math.max(MIN_BAR_PERCENT, (day.count / busiest) * 100);
          return (
            <div key={day.startMs} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              {/* Reserved whether or not there is a count, so every baseline lines up. */}
              <span className="h-4 text-xs leading-4 font-semibold tabular-nums">
                {day.count > 0 ? day.count : ''}
              </span>
              <div className="flex h-[5.25rem] w-full items-end border-b border-line">
                {day.count > 0 && (
                  <div
                    className={`w-full rounded-t-[4px] ${SEVERITY_FILL[day.severity ?? 'clear']}`}
                    style={{ height: `${percent}%` }}
                  />
                )}
              </div>
              {/* `truncate` in a `min-w-0` column: 14 labels in 320px clip rather than overflow. */}
              <span
                className={`w-full truncate text-center text-[0.6875rem] ${
                  isToday ? 'font-semibold text-text' : 'text-text-dim'
                }`}
              >
                {isToday ? t('corp.standing.strip.today') : weekday.format(day.startMs)}
              </span>
              <span className="w-full truncate text-center text-[0.6875rem] text-text-dim tabular-nums">
                {dayMonth.format(day.startMs)}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-text-dim">
        {t('corp.standing.strip.footnote', {
          count: total,
          until: dayMonth.format(days[days.length - 1].startMs),
        })}
      </p>
    </div>
  );
}
