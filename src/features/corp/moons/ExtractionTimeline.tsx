import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckboxSelect, FilterChip, Panel, RowCaret, Tooltip } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import type { ExtractionState } from '@/engine/corpTaxBook/extraction';
import { cx } from '@/lib/cx';
import { splitPlace } from '@/engine/corpTaxBook/bookSections';
import { useBook } from './useBook';
import { FILTER_STATES } from './extractionStates';
import { extractionWindowLabel, shortDate } from './moonsFormat';
import { extractionPath } from './moonsPaths';
import { StateWord } from './moonsParts';

const DAY = 86_400_000;
const BEFORE_DAYS = 20;
const AFTER_DAYS = 27;

/** The label column and what lines up with it: widens with the viewport so a long moon name keeps its room. */
const LABEL_W = 'sm:w-48 lg:w-64 xl:w-80';
const LABEL_LEFT = 'sm:left-48 lg:left-64 xl:left-80';
const LABEL_MARGIN = 'sm:ml-48 lg:ml-64 xl:ml-80';

/**
 * The state chips (a phone gets the checkbox list) that decide which Extractions the timeline and
 * the table below it show. A count is every Extraction in that state, so it is what the chip adds.
 */
export function ExtractionStateFilter({
  rows,
  states,
  onToggle,
}: {
  rows: readonly ExtractionRow[];
  states: ReadonlySet<ExtractionState>;
  onToggle: (state: ExtractionState) => void;
}) {
  const { t } = useTranslation();
  const phone = useIsPhone();
  const countOf = (state: ExtractionState) => rows.filter((r) => r.state === state).length;
  // Cancelled is rare: a chip only when the book has one.
  const listed = FILTER_STATES.filter((s) => s !== 'cancelled' || countOf(s) > 0);
  return phone ? (
    <CheckboxSelect
      label={t('corpTaxBook.moons.timeline.filter')}
      options={listed.map((s) => ({
        value: s,
        label: `${t(`corpTaxBook.moons.state.${s}`)} (${countOf(s)})`,
      }))}
      selected={states}
      onToggle={onToggle}
    />
  ) : (
    <div
      role="group"
      aria-label={t('corpTaxBook.moons.timeline.filter')}
      className="flex flex-wrap gap-1.5"
    >
      {listed.map((s) => (
        <FilterChip
          key={s}
          label={t(`corpTaxBook.moons.state.${s}`)}
          count={countOf(s)}
          selected={states.has(s)}
          onToggle={() => onToggle(s)}
        />
      ))}
    </div>
  );
}

/**
 * Every chunk on one time axis (#4056 step 1): Extracting, Ready, then
 * Fractured-and-minable until the field is assumed gone. A row opens the
 * moon's page; the line is now. Shared scale across rows so they compare.
 */
export function ExtractionTimeline({
  rows,
  states,
}: {
  rows: readonly ExtractionRow[];
  states: ReadonlySet<ExtractionState>;
}) {
  const { t } = useTranslation();
  const { view } = useBook();
  const now = Date.parse(view.input.now);
  const from = now - BEFORE_DAYS * DAY;
  const inWindow = rows.filter(
    (r) => r.state !== 'cancelled' && Date.parse(r.expiresAt ?? r.chunkArrivalAt) >= from
  );
  const shown = inWindow.filter((r) => states.has(r.state));
  return (
    <Panel
      title={t('corpTaxBook.moons.timeline.title')}
      meta={
        <span className="hidden text-xs text-text-dim sm:inline">
          {t('corpTaxBook.moons.timeline.hint')}
        </span>
      }
    >
      {shown.length === 0 ? (
        <p className="text-sm text-text-dim">
          {t(
            inWindow.length === 0
              ? 'corpTaxBook.moons.timeline.empty'
              : 'corpTaxBook.moons.timeline.emptyFiltered'
          )}
        </p>
      ) : (
        <TimelineBody shown={shown} now={now} />
      )}
    </Panel>
  );
}

function TimelineBody({ shown, now }: { shown: readonly ExtractionRow[]; now: number }) {
  const { t } = useTranslation();
  const { names } = useBook();
  const from = now - BEFORE_DAYS * DAY;
  const span = (BEFORE_DAYS + AFTER_DAYS) * DAY;
  const pct = (ms: number) => `${(Math.min(Math.max(ms - from, 0), span) / span) * 100}%`;
  const width = (a: number, b: number) =>
    `${((Math.min(Math.max(b, from), from + span) - Math.min(Math.max(a, from), from + span)) / span) * 100}%`;
  const ticks = [-BEFORE_DAYS + 1, 0, 7, 14, 21].map((d) => now + d * DAY);
  return (
    <div className="space-y-3">
      <div
        className={cx('relative h-4 text-[0.6875rem] text-text-dim sm:mr-6', LABEL_MARGIN)}
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
          className={cx('pointer-events-none absolute inset-y-0 inset-x-0 sm:right-6', LABEL_LEFT)}
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
              <span
                className={cx(
                  // Above the now line, which runs the whole column: on a phone it would cross the label.
                  'relative flex min-w-0 items-baseline gap-1 text-xs max-sm:bg-panel max-sm:group-hover:bg-panel-2 sm:shrink-0',
                  LABEL_W
                )}
              >
                <Tooltip content={place.moon !== undefined ? place.station : undefined}>
                  <span className="truncate text-accent group-hover:underline">
                    {place.moon ?? place.station}
                  </span>
                </Tooltip>
                <StateWord state={e.state} />
              </span>
              <Tooltip content={extractionWindowLabel(t, e)} side="bottom">
                <div className="relative h-4 w-full rounded-xs bg-panel-2 sm:w-auto sm:flex-1">
                  <span
                    className="absolute inset-y-1 rounded-xs bg-line-bright"
                    style={{ left: pct(start), width: width(start, ready) }}
                  />
                  <span
                    className="absolute inset-y-0 min-w-1.5 rounded-xs bg-success"
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
              </Tooltip>
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
