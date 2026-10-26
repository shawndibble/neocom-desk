import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RowCaret } from '@/components/ui';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import { cx } from '@/lib/cx';
import { splitPlace } from '@/engine/corpTaxBook/bookSections';
import { useBook } from './useBook';
import { shortDate } from './moonsFormat';
import { extractionPath } from './moonsPaths';
import { StateWord } from './moonsParts';

const DAY = 86_400_000;
const BEFORE_DAYS = 20;
const AFTER_DAYS = 27;

/**
 * Every chunk on one time axis (#4056 step 1): Extracting, Ready, then
 * Fractured-and-minable until the field is assumed gone. A row opens the
 * moon's page; the line is now. Shared scale across rows so they compare.
 */
export function ExtractionTimeline({ rows }: { rows: readonly ExtractionRow[] }) {
  const { t } = useTranslation();
  const { view, names } = useBook();
  const now = Date.parse(view.input.now);
  const from = now - BEFORE_DAYS * DAY;
  const span = (BEFORE_DAYS + AFTER_DAYS) * DAY;
  const pct = (ms: number) => `${(Math.min(Math.max(ms - from, 0), span) / span) * 100}%`;
  const width = (a: number, b: number) =>
    `${((Math.min(Math.max(b, from), from + span) - Math.min(Math.max(a, from), from + span)) / span) * 100}%`;
  const shown = rows.filter(
    (r) => r.state !== 'cancelled' && Date.parse(r.expiresAt ?? r.chunkArrivalAt) >= from
  );
  if (shown.length === 0)
    return <p className="text-sm text-text-dim">{t('corpTaxBook.moons.timeline.empty')}</p>;
  const ticks = [-BEFORE_DAYS + 1, 0, 7, 14, 21].map((d) => now + d * DAY);
  return (
    <div className="space-y-3">
      <div
        className="relative h-4 text-[0.6875rem] text-text-dim sm:ml-48 sm:mr-6"
        aria-hidden="true"
      >
        {ticks.map((ms, i) => (
          <span key={ms} className="absolute -translate-x-1/2" style={{ left: pct(ms) }}>
            {i === 1 ? t('corpTaxBook.moons.timeline.now') : shortDate(new Date(ms).toISOString())}
          </span>
        ))}
      </div>
      <div className="relative space-y-3">
        {/* One "now" line over the whole bars column: a line per row froze Chrome's painting. */}
        <div
          data-testid="timeline-now"
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 inset-x-0 sm:left-48 sm:right-6"
        >
          <span className="absolute inset-y-0 w-px bg-text" style={{ left: pct(now) }} />
        </div>
        {shown.map((e) => {
          const start = Date.parse(e.startedAt);
          const ready = Date.parse(e.chunkArrivalAt);
          const fracture = e.fracturedAt ? Date.parse(e.fracturedAt) : ready;
          const end = e.expiresAt ? Date.parse(e.expiresAt) : ready;
          const place = splitPlace(names.refinery(e.structureId), names.moon(e.moonId));
          return (
            <Link
              key={e.id}
              to={extractionPath(e.id)}
              className="group flex flex-col gap-1 rounded-xs py-0.5 hover:bg-panel-2 sm:flex-row sm:items-center sm:gap-0"
            >
              <span className="flex min-w-0 items-baseline gap-1 text-xs sm:w-48 sm:shrink-0">
                <span
                  className="truncate text-accent group-hover:underline"
                  title={place.moon !== undefined ? place.station : undefined}
                >
                  {place.moon ?? place.station}
                </span>
                <StateWord state={e.state} />
              </span>
              <div className="relative h-4 w-full rounded-xs bg-panel-2 sm:w-auto sm:flex-1">
                <span
                  className="absolute inset-y-1 rounded-xs bg-line-bright"
                  style={{ left: pct(start), width: width(start, ready) }}
                />
                <span
                  className="absolute inset-y-0 rounded-xs bg-success"
                  style={{
                    left: pct(ready),
                    width: width(ready, Math.max(fracture, ready + DAY / 24)),
                  }}
                />
                <span
                  className={cx(
                    'absolute inset-y-0 rounded-xs',
                    e.state === 'expired' ? 'bg-text-faint' : 'bg-warning'
                  )}
                  style={{ left: pct(fracture), width: width(fracture, end) }}
                />
              </div>
              <span className="hidden w-6 justify-end sm:flex">
                <RowCaret />
              </span>
            </Link>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-dim">
        {(
          [
            ['bg-line-bright', 'extracting'],
            ['bg-success', 'ready'],
            ['bg-warning', 'fractured'],
            ['bg-text-faint', 'expired'],
          ] as const
        ).map(([color, key]) => (
          <span key={key}>
            <span className={cx('mr-1 inline-block h-2 w-4 rounded-xs', color)} />
            {t(`corpTaxBook.moons.timeline.legend.${key}`)}
          </span>
        ))}
      </p>
    </div>
  );
}
