import { Panel, Tooltip } from '@/components/ui';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import { splitPlace } from '@/engine/corpTaxBook/bookSections';
import { cx } from '@/lib/cx';
import { DAY_MS, HOUR_MS } from '@/lib/age';
import { useBook } from '@/features/corp/moons/useBook';
import { BOOK_VIEW } from '@/features/corp/moons/corpBookFixture';
import { formatCountdown } from '@/lib/duration';
import { formatLocalDateTime } from '@/lib/localDate';
import { StateWord } from '@/features/corp/moons/moonsParts';
import { NewComponent } from './NewComponent';

const BEFORE_DAYS = 20;
const AFTER_DAYS = 27;
const LABEL_W = 'sm:w-48 lg:w-64 xl:w-80';
const LABEL_LEFT = 'sm:left-48 lg:left-64 xl:left-80';
const LABEL_MARGIN = 'sm:ml-48 lg:ml-64 xl:ml-80';
const NOW = Date.parse(BOOK_VIEW.input.now);
const AUTO_H = 3;
const FIELD_H = 48;

const at = (hours: number) => new Date(NOW + hours * HOUR_MS).toISOString();
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function row(
  id: string,
  structureId: number,
  moonId: number,
  state: ExtractionRow['state'],
  startH: number,
  arriveH: number,
  fracture?: { atH: number; by: 'laser' | 'auto' }
): ExtractionRow {
  return {
    id,
    structureId,
    moonId,
    state,
    startedAt: at(startH),
    chunkArrivalAt: at(arriveH),
    plannedFractureAt: at(fracture?.atH ?? arriveH + AUTO_H),
    plannedExpiresAt: at((fracture?.atH ?? arriveH + AUTO_H) + FIELD_H),
    ...(fracture
      ? {
          fracturedAt: at(fracture.atH),
          fracturedBy: fracture.by,
          expiresAt: at(fracture.atH + FIELD_H),
        }
      : {}),
    oreSource: 'unknown',
    oreLines: [],
    estimatedValue: null,
    minedPct: null,
    tax: 0,
    minerCount: 0,
  };
}

// eslint-disable-next-line react-refresh/only-export-components -- throwaway mockup fixture
export const STATE_ROWS: ExtractionRow[] = [
  row('pulled', 1003, 5, 'extracting', -9 * 24, 2 * 24 + 5),
  row('ready', 1002, 4, 'ready', -14 * 24, -1, undefined),
  row('minable', 1001, 3, 'fractured', -21 * 24, -20, { atH: -17, by: 'auto' }),
  row('early', 1002, 4, 'fractured', -20 * 24, -10, { atH: -5, by: 'laser' }),
  row('expired', 1001, 3, 'expired', -30 * 24, -4 * 24, { atH: -4 * 24 + 3, by: 'auto' }),
];
STATE_ROWS[1] = {
  ...STATE_ROWS[1],
  fracturedAt: undefined,
  expiresAt: undefined,
  chunkArrivalAt: at(-1),
};

interface Parts {
  start: number;
  ready: number;
  fracture: number;
  end: number;
  early: boolean;
  projected: boolean;
}

function partsOf(e: ExtractionRow): Parts {
  const start = Date.parse(e.startedAt);
  const ready = Date.parse(e.chunkArrivalAt);
  const projected = !e.fracturedAt;
  const fracture = e.fracturedAt ? Date.parse(e.fracturedAt) : ready + AUTO_H * HOUR_MS;
  const end = e.expiresAt ? Date.parse(e.expiresAt) : fracture + FIELD_H * HOUR_MS;
  return { start, ready, fracture, end, early: e.fracturedBy === 'laser', projected };
}

function PlanTip({ p }: { p: Parts }) {
  const line = (label: string, ms: number) => (
    <div>
      <div className="text-text-dim">{label}</div>
      <div className="tabular-nums">
        {formatLocalDateTime(new Date(ms))}
        {ms > NOW && (
          <span className="text-text-dim"> · in {formatCountdown((ms - NOW) / 1000)}</span>
        )}
      </div>
    </div>
  );
  return (
    <div className="space-y-1 text-left">
      {line('Ready (chunk arrives)', p.ready)}
      {line(p.early ? 'Fractured (laser)' : 'Auto-fracture', p.fracture)}
      {line('Expired', p.end)}
    </div>
  );
}

export function ProposedTimeline({
  rows,
  title,
  openRow,
}: {
  rows: readonly ExtractionRow[];
  title: string;
  openRow?: string;
}) {
  const { names } = useBook();
  const from = NOW - BEFORE_DAYS * DAY_MS;
  const span = (BEFORE_DAYS + AFTER_DAYS) * DAY_MS;
  const clamp = (ms: number) => Math.min(Math.max(ms, from), from + span);
  const pct = (ms: number) => `${((clamp(ms) - from) / span) * 100}%`;
  const width = (a: number, b: number) => `${((clamp(b) - clamp(a)) / span) * 100}%`;
  const ticks = [-BEFORE_DAYS + 1, 0, 7, 14, 21].map((d) => NOW + d * DAY_MS);
  return (
    <NewComponent name="MinableTimeline">
      <Panel title={title}>
        <div className="space-y-3">
          <div
            className={cx('relative h-4 text-[0.6875rem] text-text-dim sm:mr-6', LABEL_MARGIN)}
            aria-hidden="true"
          >
            {ticks.map((ms, i) => (
              <span key={ms} className="absolute -translate-x-1/2" style={{ left: pct(ms) }}>
                {i === 1 ? 'Now' : dayLabel(new Date(ms).toISOString())}
              </span>
            ))}
          </div>
          <div className="relative space-y-3">
            <div
              aria-hidden="true"
              className={cx(
                'pointer-events-none absolute inset-y-0 inset-x-0 sm:right-6',
                LABEL_LEFT
              )}
            >
              <span className="absolute inset-y-0 w-px bg-text" style={{ left: pct(NOW) }} />
            </div>
            {rows
              .filter((r) => Date.parse(r.expiresAt ?? r.chunkArrivalAt) >= from)
              .map((e) => {
                const p = partsOf(e);
                const place = splitPlace(names.refinery(e.structureId), names.moon(e.moonId));
                const expired = e.state === 'expired';
                return (
                  <div
                    key={e.id}
                    className="flex flex-col gap-1 rounded-xs py-0.5 sm:flex-row sm:items-center sm:gap-0"
                  >
                    <span
                      className={cx(
                        'relative flex min-w-0 items-baseline gap-1 text-xs max-sm:bg-panel sm:shrink-0',
                        LABEL_W
                      )}
                    >
                      <span className="truncate text-accent">{place.moon ?? place.station}</span>
                      <StateWord state={e.state} />
                    </span>
                    <Tooltip content={<PlanTip p={p} />} side="bottom">
                      <div
                        tabIndex={0}
                        data-open-tip={e.id === openRow ? 'true' : undefined}
                        className="relative h-4 w-full rounded-xs bg-panel-2 focus-visible:outline-2 focus-visible:outline-accent sm:w-auto sm:flex-1"
                      >
                        <span
                          className="absolute inset-y-1 rounded-xs bg-line-bright"
                          style={{ left: pct(p.start), width: width(p.start, p.ready) }}
                        />
                        <span
                          className={cx(
                            'absolute inset-y-0 min-w-1.5 rounded-xs',
                            expired ? 'bg-text-faint' : 'bg-success'
                          )}
                          style={{ left: pct(p.ready), width: width(p.ready, p.end) }}
                        />
                        {p.early && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 w-0.5 bg-panel"
                            style={{ left: pct(p.fracture) }}
                          />
                        )}
                      </div>
                    </Tooltip>
                    <span className="hidden w-6 sm:block" />
                  </div>
                );
              })}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-dim">
            <span>
              <span className="mr-1 inline-block h-2 w-4 rounded-xs bg-line-bright" />
              Extracting
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-4 rounded-xs bg-success" />
              Ready to Expired
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-4 rounded-xs bg-text-faint" />
              Expired
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-0.5 bg-text-dim" /> Early laser fracture
            </span>
          </p>
        </div>
      </Panel>
    </NewComponent>
  );
}
