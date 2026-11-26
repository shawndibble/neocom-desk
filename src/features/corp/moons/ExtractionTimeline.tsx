import type { ReactNode } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckboxSelect, FilterChip, Panel, RowCaret, Tooltip } from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import type { ExtractionState } from '@/engine/corpTaxBook/extraction';
import { cx } from '@/lib/cx';
import { splitPlace } from '@/engine/corpTaxBook/bookSections';
import { useBook } from './useBook';
import { EXPIRED_KEEP_DAYS, FILTER_STATES, isPastExtraction } from './extractionStates';
import { atDate, extractionWindowLabel } from './moonsFormat';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDateTime } from '@/lib/localDate';
import { extractionPath } from './moonsPaths';
import { StateWord } from './moonsParts';
import { DAY_MS } from '@/lib/age';

const AFTER_DAYS = 27;

const LABEL_W = 'sm:w-48 lg:w-64 xl:w-80';
const LABEL_LEFT = 'sm:left-48 lg:left-64 xl:left-80';
const LABEL_MARGIN = 'sm:ml-48 lg:ml-64 xl:ml-80';

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
  const listed = FILTER_STATES.filter((s) => s !== 'cancelled' || countOf(s) > 0);
  return phone ? (
    <CheckboxSelect
      size="sm"
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

function PlanTip({ row, now }: { row: ExtractionRow; now: number }) {
  const { t } = useTranslation();
  const zone = useTimeZone();
  const line = (label: string, iso: string) => {
    const ms = Date.parse(iso);
    return (
      <div>
        <div className="text-text-dim">{label}</div>
        <div className="tabular-nums">
          {formatLocalDateTime(new Date(ms), zone)}
          {ms > now && (
            <span className="text-text-dim">
              {' · '}
              {t('corpTaxBook.moons.timeline.tip.in', { time: formatCountdown((ms - now) / 1000) })}
            </span>
          )}
        </div>
      </div>
    );
  };
  const laser = row.fracturedBy === 'laser';
  return (
    <div className="space-y-1 text-left">
      {line(t('corpTaxBook.moons.timeline.tip.ready'), row.chunkArrivalAt)}
      {line(
        t(`corpTaxBook.moons.timeline.tip.${laser ? 'laser' : 'auto'}`),
        row.fracturedAt ?? row.plannedFractureAt
      )}
      {line(t('corpTaxBook.moons.timeline.tip.expired'), row.expiresAt ?? row.plannedExpiresAt)}
    </div>
  );
}

export function ExtractionTimeline({
  rows,
  states,
  filter,
}: {
  rows: readonly ExtractionRow[];
  states: ReadonlySet<ExtractionState>;
  filter?: ReactNode;
}) {
  const { t } = useTranslation();
  const { view } = useBook();
  const now = Date.parse(view.input.now);
  const inWindow = rows.filter((r) => !isPastExtraction(r, now));
  const shown = inWindow.filter((r) => states.has(r.state));
  return (
    <Panel
      title={t('corpTaxBook.moons.timeline.title')}
      actions={filter}
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
  const zone = useTimeZone();
  const { t } = useTranslation();
  const { names } = useBook();
  const from = now - EXPIRED_KEEP_DAYS * DAY_MS;
  const span = (EXPIRED_KEEP_DAYS + AFTER_DAYS) * DAY_MS;
  const pct = (ms: number) => `${(Math.min(Math.max(ms - from, 0), span) / span) * 100}%`;
  const width = (a: number, b: number) =>
    `${((Math.min(Math.max(b, from), from + span) - Math.min(Math.max(a, from), from + span)) / span) * 100}%`;
  const ticks = [0, 7, 14, 21].map((d) => now + d * DAY_MS);
  return (
    <div className="space-y-3">
      <div
        className={cx('relative h-4 text-[0.6875rem] text-text-dim sm:mr-6', LABEL_MARGIN)}
        aria-hidden="true"
      >
        {ticks.map((ms, i) => (
          <span key={ms} className="absolute -translate-x-1/2" style={{ left: pct(ms) }}>
            {i === 0 ? t('corpTaxBook.moons.timeline.now') : atDate(ms, zone)}
          </span>
        ))}
      </div>
      <div className="relative space-y-3">
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
          const end = Date.parse(e.expiresAt ?? e.plannedExpiresAt);
          const place = splitPlace(names.refinery(e.structureId), names.moon(e.moonId));
          return (
            <Link
              key={e.id}
              to={extractionPath(e.id)}
              className="group flex flex-col gap-1 rounded-xs py-0.5 hover:bg-panel-2 sm:flex-row sm:items-center sm:gap-0"
            >
              <span
                className={cx(
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
              <Tooltip content={<PlanTip row={e} now={now} />} side="bottom">
                <div
                  tabIndex={0}
                  aria-label={extractionWindowLabel(t, e, zone)}
                  className="relative h-4 w-full rounded-xs bg-panel-2 focus-visible:outline-2 focus-visible:outline-accent sm:w-auto sm:flex-1"
                >
                  <span
                    className="absolute inset-y-1 rounded-xs bg-line-bright"
                    style={{ left: pct(start), width: width(start, ready) }}
                  />
                  <span
                    className={cx(
                      'absolute inset-y-0 min-w-1.5 rounded-xs',
                      e.state === 'expired' ? 'bg-text-faint' : 'bg-success'
                    )}
                    style={{ left: pct(ready), width: width(ready, end) }}
                  />
                  {e.fracturedBy === 'laser' && e.fracturedAt && (
                    <span
                      aria-hidden="true"
                      data-testid="laser-tick"
                      className="absolute inset-y-0 w-0.5 bg-panel"
                      style={{ left: pct(Date.parse(e.fracturedAt)) }}
                    />
                  )}
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
            ['bg-text-faint', 'expired'],
          ] as const
        ).map(([color, key]) => (
          <span key={key}>
            <span className={cx('mr-1 inline-block h-2 w-4 rounded-xs', color)} />
            {t(`corpTaxBook.moons.timeline.legend.${key}`)}
          </span>
        ))}
        <span>
          <span className="mr-1 inline-block h-2 w-0.5 bg-text-dim" />
          {t('corpTaxBook.moons.timeline.legend.laser')}
        </span>
      </p>
    </div>
  );
}
