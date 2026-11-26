import { DataTable, Panel, RowCaret, type DataTableColumn } from '@/components/ui';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { MOONS, type MoonRow } from './moonsAllMoonsFixtures';
import { StateWord } from './moonsAllMoonsShared';
import { isk } from './moonsAllMoonsFormat';

const ROWS = MOONS.filter((m) => m.owner === 'Tallow Station Co' && !m.archived);

const cols: DataTableColumn<MoonRow>[] = [
  {
    id: 'moon',
    header: 'Moon',
    primary: true,
    render: (r) => (
      <a href={`/corp/moons/moons/${r.id}`} className={entityLinkClassName('font-medium')}>
        {r.moon}
      </a>
    ),
  },
  {
    id: 'state',
    header: 'Latest',
    render: (r) => (r.newest ? <StateWord state={r.newest} /> : '—'),
  },
  {
    id: 'pops',
    header: 'Extractions',
    align: 'right',
    className: 'tabular-nums',
    render: (r) => r.pops,
  },
  {
    id: 'mined',
    header: 'Mined (est.)',
    align: 'right',
    className: 'tabular-nums',
    cardCorner: true,
    render: (r) => isk(r.minedIsk),
  },
];

export function OwnerMoons() {
  return (
    <Panel title="Tallow Station Co: moons" padded={false}>
      <DataTable
        label="Moons of this moon owner"
        columns={cols}
        rows={ROWS}
        rowKey={(r) => r.id}
        density="compact"
        stackColumns={2}
      />
    </Panel>
  );
}

const extractionCols: DataTableColumn<MoonRow>[] = [
  {
    id: 'moon',
    header: 'Moon',
    primary: true,
    render: (r) => (
      <span className="block">
        <a href={`/corp/moons/moons/${r.id}`} className={entityLinkClassName('font-medium')}>
          {r.moon}
        </a>
        <span className="block text-xs text-text-dim">{r.refinery}</span>
      </span>
    ),
  },
  {
    id: 'state',
    header: 'State',
    render: (r) => (r.newest ? <StateWord state={r.newest} /> : '—'),
  },
  { id: 'when', header: 'When', render: (r) => r.nextPop ?? r.lastPop },
  {
    id: 'go',
    header: '',
    align: 'right',
    className: 'w-6 max-sm:hidden',
    render: () => <RowCaret />,
  },
];

export function ExtractionsRows() {
  return (
    <Panel title="Extractions" padded={false}>
      <DataTable
        label="Extractions"
        columns={extractionCols}
        rows={MOONS.slice(0, 4)}
        rowKey={(r) => r.id}
        onRowClick={() => {}}
        rowClassName={() => 'group'}
        density="compact"
        stackColumns={2}
      />
    </Panel>
  );
}
