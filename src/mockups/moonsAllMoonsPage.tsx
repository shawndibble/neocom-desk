import { Fragment, useState, type ReactNode } from 'react';
import {
  DataTable,
  EmptyState,
  FilterChip,
  PageHeader,
  Panel,
  ProgressBar,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { Pill } from '@/components/ui/Pill';
import { cx } from '@/lib/cx';
import { useIsPhone } from '@/lib/useIsPhone';
import { NewComponent } from './NewComponent';
import { OPEN_MOON, type Pop, type PopState } from './moonsAllMoonsFixtures';
import { Crumb, StateWord } from './moonsAllMoonsShared';
import { isk, makeUp, units } from './moonsAllMoonsFormat';

const NONE = <span className="text-text-dim">—</span>;
const FILTER_STATES: PopState[] = ['extracting', 'fractured', 'expired', 'cancelled'];

type Moon = Pick<typeof OPEN_MOON, 'moon' | 'refinery' | 'owner' | 'id'> & { system: string };

/** Header and chips of an opened moon: what the book holds for it in one line each. */
function MoonHead({ moon, chips }: { moon: Moon; chips: ReactNode }) {
  return (
    <>
      <Crumb label="Moons" />
      <PageHeader
        title={moon.moon}
        meta={
          <span className="text-xs text-text-dim">
            {moon.refinery} · {moon.owner}
          </span>
        }
      />
      <StatChips>{chips}</StatChips>
    </>
  );
}

export function FullChips() {
  return (
    <>
      <StatChip label="Pops kept" value="14" />
      <StatChip label="Mined (est.)" value={isk(4_812_000_000)} emphasis />
      <StatChip label="Tax recorded" value={isk(481_200_000)} />
      <StatChip label="Next pop" value="19 Nov 14:12" />
    </>
  );
}

/** The state chips every history list shows, with the count of each. */
function StateChips({
  pops,
  on,
  toggle,
}: {
  pops: Pop[];
  on: Set<PopState>;
  toggle: (s: PopState) => void;
}) {
  return (
    <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
      {FILTER_STATES.map((s) => (
        <FilterChip
          key={s}
          label={s[0].toUpperCase() + s.slice(1)}
          count={pops.filter((p) => p.state === s).length}
          selected={on.has(s)}
          onToggle={() => toggle(s)}
        />
      ))}
    </div>
  );
}

function useStateFilter() {
  const [on, setOn] = useState<Set<PopState>>(new Set(FILTER_STATES));
  return {
    on,
    toggle: (s: PopState) =>
      setOn((prev) => {
        const next = new Set(prev);
        if (!next.delete(s)) next.add(s);
        return next;
      }),
  };
}

function MinedCell({ p }: { p: Pop }) {
  if (p.minedPct === null) return NONE;
  return (
    <span className="block min-w-28">
      <span className="text-xs tabular-nums">
        {p.minedPct}% mined · {100 - p.minedPct}% left
      </span>
      <ProgressBar label="Mined" value={p.minedPct} size="xs" className="mt-1" />
    </span>
  );
}

const MAKE_UP_UNKNOWN = <span className="text-warning">Ore unknown</span>;

/** What a pop shows under the table row: the make-up chunk vs mined, and who mined it. */
function PopDetail({ p }: { p: Pop }) {
  return (
    <div className="grid gap-4 p-3 sm:grid-cols-2">
      <div className="min-w-0">
        <h4 className="mb-1 text-xs font-semibold tracking-wide text-text-dim uppercase">
          Chunk make-up
        </h4>
        {p.ore.length === 0 ? (
          <p className="text-sm text-text-dim">
            No notification or Survey gave this chunk&apos;s ore.{' '}
            <a href="/corp/moons/extractions" className={entityLinkClassName()}>
              Link a Survey
            </a>
          </p>
        ) : (
          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 gap-y-0.5 text-sm tabular-nums">
            {['Ore', 'Chunk', 'Mined', 'Left'].map((h, i) => (
              <span key={h} className={cx('text-xs text-text-dim', i > 0 && 'text-right')}>
                {h}
              </span>
            ))}
            {p.ore.map((o) => (
              <Fragment key={o.ore}>
                <span>{o.ore}</span>
                <span className="text-right">{units(o.units)}</span>
                <span className="text-right">{o.mined ? units(o.mined) : '—'}</span>
                <span className="text-right">
                  {p.minedPct === null ? '—' : units(o.units - o.mined)}
                </span>
              </Fragment>
            ))}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <h4 className="mb-1 text-xs font-semibold tracking-wide text-text-dim uppercase">
          Mined from it
        </h4>
        {p.miners === 0 ? (
          <p className="text-sm text-text-dim">
            {p.state === 'cancelled' ? 'Cancelled before it popped.' : 'Nobody has mined it yet.'}
          </p>
        ) : (
          <>
            <ul className="text-sm">
              {p.topMiners.map((m) => (
                <li key={m.name} className="flex justify-between gap-2 tabular-nums">
                  <span>{m.name}</span>
                  <span>{isk(m.isk)}</span>
                </li>
              ))}
            </ul>
            <a
              href="/corp/moons/miners"
              className={entityLinkClassName('mt-1 inline-block text-sm')}
            >
              All {p.miners} miners of this pop
            </a>
            {p.fullyMined && (
              <p className="mt-1 text-xs text-text-dim">Fully Mined by Mira Soltane on 11 Nov.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function popColumns(phone: boolean): DataTableColumn<Pop>[] {
  const cols: DataTableColumn<Pop>[] = [
    {
      id: 'pop',
      header: 'Pop',
      primary: true,
      render: (p) => p.pop,
      sortValue: (p) => Number(p.id.slice(1)),
    },
    { id: 'state', header: 'State', render: (p) => <StateWord state={p.state} /> },
    { id: 'started', header: 'Started', render: (p) => p.started },
    {
      id: 'fractured',
      header: 'Fractured',
      render: (p) =>
        p.fractured ? (
          <span className="block">
            {p.fractured}
            <span className="block text-xs text-text-dim">
              {p.by === 'laser' ? 'By laser' : 'Broke on its own'}
            </span>
          </span>
        ) : p.cancelledOn ? (
          <span className="text-text-dim">Cancelled {p.cancelledOn}</span>
        ) : (
          NONE
        ),
    },
    {
      id: 'makeup',
      header: 'Chunk make-up',
      render: (p) => (
        <span className="block min-w-0">
          {p.ore.length ? makeUp(p.ore) : MAKE_UP_UNKNOWN}
          {p.estIsk && <span className="block text-xs text-text-dim">{isk(p.estIsk)} est.</span>}
        </span>
      ),
    },
    { id: 'mined', header: 'Mined from it', render: (p) => <MinedCell p={p} /> },
    {
      id: 'tax',
      header: 'Tax',
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (p) => (p.tax ? isk(p.tax) : NONE),
      sortValue: (p) => p.tax,
    },
  ];
  return phone ? cols.filter((c) => c.id !== 'started') : cols;
}

/** Variant A: one table, a row per pop, a row opens to make-up and miners. */
export function MoonPageA({
  moon = OPEN_MOON,
  pops = OPEN_MOON.popRows,
  chips = <FullChips />,
  footnote,
}: {
  moon?: Moon;
  pops?: Pop[];
  chips?: ReactNode;
  footnote?: ReactNode;
}) {
  const phone = useIsPhone();
  const { on, toggle } = useStateFilter();
  const shown = pops.filter((p) => on.has(p.state));
  return (
    <div className="space-y-4">
      <MoonHead moon={moon} chips={chips} />
      <Panel title="Extractions" padded={false}>
        {pops.length > 1 && (
          <div className="p-3">
            <StateChips pops={pops} on={on} toggle={toggle} />
          </div>
        )}
        <DataTable
          label="Extractions"
          columns={popColumns(phone)}
          rows={shown}
          rowKey={(p) => p.id}
          density="compact"
          defaultSort={{ columnId: 'pop', direction: 'desc' }}
          expandableRow={{
            leadingIcon: true,
            initialKey: pops.length > 1 ? 'p13' : null,
            renderDetail: (p) => (
              <NewComponent name="PopDetail">
                <PopDetail p={p} />
              </NewComponent>
            ),
          }}
          mobileSort
          stackColumns={2}
        />
        {footnote}
      </Panel>
    </div>
  );
}

const DOT: Record<PopState, string> = {
  extracting: 'bg-accent',
  ready: 'bg-success',
  fractured: 'bg-warning',
  expired: 'bg-text-faint',
  cancelled: 'bg-danger',
};

/** One pop as a small timeline: Started, Pop, Fractured, Field gone. */
function Steps({ p }: { p: Pop }) {
  const steps: [string, string | undefined, boolean][] = [
    ['Started', p.started, true],
    ['Pop', p.pop, p.state !== 'extracting' && p.state !== 'cancelled'],
    [
      p.cancelledOn ? 'Cancelled' : 'Fractured',
      p.cancelledOn ?? p.fractured,
      p.state !== 'extracting',
    ],
    ['Field gone', p.fieldGone, p.state === 'expired'],
  ];
  return (
    <ol className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
      {steps.map(([label, when, done]) => (
        <li key={label} className="min-w-0">
          <span className="flex items-center gap-1.5 text-xs text-text-dim">
            <span
              aria-hidden="true"
              className={cx('size-2 rounded-full', done ? DOT[p.state] : 'border border-line')}
            />
            {label}
          </span>
          <span className={cx('block text-sm tabular-nums', !when && 'text-text-dim')}>
            {when ?? '—'}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Variant B: one card per pop, stacked newest first, each with its own timeline. */
function PopCard({ p }: { p: Pop }) {
  return (
    <li className="space-y-3 border-t border-line p-3 first:border-t-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2">
          <StateWord state={p.state} />
          <span className="font-semibold tabular-nums">Pop {p.pop}</span>
          {p.fractured && <Pill>{p.by === 'laser' ? 'Laser' : 'Auto'}</Pill>}
        </span>
        <span className="text-sm tabular-nums text-text-dim">
          {p.tax ? `Tax ${isk(p.tax)}` : ''}
        </span>
      </div>
      <Steps p={p} />
      <p className="text-sm">
        {p.ore.length ? makeUp(p.ore) : MAKE_UP_UNKNOWN}
        {p.estIsk && <span className="text-text-dim"> · {isk(p.estIsk)} est.</span>}
      </p>
      {p.minedPct !== null && (
        <div>
          <span className="text-xs tabular-nums">
            {p.minedPct}% mined · {100 - p.minedPct}% left · {p.miners} miners
          </span>
          <ProgressBar label="Mined" value={p.minedPct} size="xs" className="mt-1" />
        </div>
      )}
      {p.miners > 0 && (
        <p className="text-xs text-text-dim">
          Mined by {p.topMiners.map((m) => m.name).join(', ')}
          {p.miners > 3 && (
            <>
              {' '}
              and {p.miners - 3} more{' · '}
              <a href="/corp/moons/miners" className={entityLinkClassName()}>
                Open miners
              </a>
            </>
          )}
        </p>
      )}
    </li>
  );
}

export function MoonPageB() {
  const { on, toggle } = useStateFilter();
  const pops = OPEN_MOON.popRows;
  return (
    <div className="space-y-4">
      <MoonHead moon={OPEN_MOON} chips={<FullChips />} />
      <Panel title="Extractions" padded={false}>
        <div className="p-3">
          <StateChips pops={pops} on={on} toggle={toggle} />
        </div>
        <NewComponent name="PopCard">
          <ol aria-label="Extractions">
            {pops
              .filter((p) => on.has(p.state))
              .map((p) => (
                <PopCard key={p.id} p={p} />
              ))}
          </ol>
        </NewComponent>
      </Panel>
    </div>
  );
}

/** Empty history: the one live pop is there; nothing earlier was kept. */
export function EmptyHistory({ moon, live }: { moon: Moon & { bookStart: string }; live: Pop }) {
  return (
    <MoonPageA
      moon={moon}
      pops={[live]}
      chips={
        <>
          <StatChip label="Pops kept" value="1" />
          <StatChip label="Mined (est.)" value="—" />
          <StatChip label="Next pop" value="18 Nov 21:30" />
        </>
      }
      footnote={
        <div className="border-t border-line">
          <EmptyState
            title="No earlier pops"
            hint={`The book keeps every pop it syncs, starting ${moon.bookStart}. Pops before that were never in it.`}
          />
        </div>
      }
    />
  );
}
