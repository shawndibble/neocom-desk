import { useState, type ReactNode } from 'react';
import {
  DataTable,
  EmptyState,
  FilterChip,
  PageHeader,
  Panel,
  ProgressBar,
  RowCaret,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import { useIsPhone } from '@/lib/useIsPhone';
import { OPEN_MOON, type Pop, type PopState } from './moonsAllMoonsFixtures';
import { Crumb, StateWord } from './moonsAllMoonsShared';
import { isk, makeUp } from './moonsAllMoonsFormat';

const NONE = <span className="text-text-dim">—</span>;
const FILTER_STATES: PopState[] = ['extracting', 'fractured', 'expired', 'cancelled'];

type Moon = Pick<typeof OPEN_MOON, 'moon' | 'refinery' | 'owner' | 'id'> & { system: string };

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
      <StatChip label="Extractions" value="14" />
      <StatChip label="Mined (est.)" value={isk(4_812_000_000)} emphasis />
      <StatChip label="Tax recorded" value={isk(481_200_000)} />
      <StatChip label="Next pop" value="19 Nov 14:12" />
    </>
  );
}

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
  if (phone) return cols.filter((c) => c.id !== 'started');
  cols.push({ id: 'go', header: '', align: 'right', className: 'w-6', render: () => <RowCaret /> });
  return cols;
}

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
          onRowClick={() => {}}
          rowClassName={() => 'group'}
          mobileSort
          stackColumns={2}
        />
        {footnote}
      </Panel>
    </div>
  );
}

export function EmptyHistory({ moon, live }: { moon: Moon & { bookStart: string }; live: Pop }) {
  return (
    <MoonPageA
      moon={moon}
      pops={[live]}
      chips={
        <>
          <StatChip label="Extractions" value="1" />
          <StatChip label="Mined (est.)" value="—" />
          <StatChip label="Next pop" value="18 Nov 21:30" />
        </>
      }
      footnote={
        <div className="border-t border-line">
          <EmptyState
            title="No earlier Extractions"
            hint={`The book keeps every Extraction it syncs, starting ${moon.bookStart}. Extractions before that were never in it.`}
          />
        </div>
      }
    />
  );
}
