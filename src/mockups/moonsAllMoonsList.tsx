import { useState } from 'react';
import {
  DataTable,
  FilterBar,
  FilterChip,
  FilterField,
  Panel,
  RowCaret,
  SearchInput,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import { useIsPhone } from '@/lib/useIsPhone';
import { BOOK_CORP, MOONS, type MoonRow } from './moonsAllMoonsFixtures';
import { MoonLink, StateWord } from './moonsAllMoonsShared';
import { isk } from './moonsAllMoonsFormat';

interface Filters {
  owner: 'all' | 'own' | 'feeders';
  archived: boolean;
}

const NONE = <span className="text-text-dim">—</span>;

/** Moon first: the name is the row's handle, the station under it. */
const moonColumn = (withStation: boolean, phone: boolean): DataTableColumn<MoonRow> => ({
  id: 'moon',
  header: 'Moon',
  primary: true,
  render: (r) => (
    <span className="block min-w-0">
      {r.unknownMoon ? (
        <span className="text-text-dim">{r.moon}</span>
      ) : (
        <MoonLink name={r.moon} id={r.id} />
      )}
      {withStation && (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-text-dim">
          {phone && r.owner !== BOOK_CORP ? `${r.refinery} · ${r.owner}` : r.refinery}
          {r.archived && <Pill>Archived</Pill>}
        </span>
      )}
    </span>
  ),
  sortValue: (r) => r.moon,
});

function columns(grouped: boolean, phone: boolean): DataTableColumn<MoonRow>[] {
  const cols: DataTableColumn<MoonRow>[] = [
    moonColumn(!grouped, phone),
    {
      id: 'owner',
      header: 'Owner',
      render: (r) => <>{r.owner === BOOK_CORP ? 'Our corp' : r.owner}</>,
      sortValue: (r) => r.owner,
    },
    {
      id: 'state',
      header: 'Latest',
      render: (r) => (r.newest ? <StateWord state={r.newest} /> : NONE),
      sortValue: (r) => r.newest ?? undefined,
    },
    {
      id: 'next',
      header: 'Next pop',
      render: (r) =>
        phone
          ? r.nextPop
            ? `Pop ${r.nextPop}`
            : r.lastPop
              ? `Last pop ${r.lastPop}`
              : 'No Extraction yet'
          : (r.nextPop ?? NONE),
      sortValue: (r) => r.nextPop,
    },
    {
      id: 'last',
      header: 'Last pop',
      render: (r) => r.lastPop ?? NONE,
      sortValue: (r) => r.lastPop,
    },
    {
      id: 'pops',
      header: 'Pops',
      align: 'right',
      className: 'tabular-nums',
      render: (r) => r.pops,
      sortValue: (r) => r.pops,
    },
    {
      id: 'mined',
      header: 'Mined (est.)',
      align: 'right',
      className: 'tabular-nums',
      render: (r) =>
        r.minedIsk
          ? phone
            ? `${isk(r.minedIsk)} mined`
            : isk(r.minedIsk)
          : phone
            ? 'Nothing mined'
            : NONE,
      sortValue: (r) => r.minedIsk,
    },
    {
      id: 'tax',
      header: 'Tax',
      align: 'right',
      className: 'tabular-nums',
      cardCorner: true,
      render: (r) => (r.tax ? isk(r.tax) : NONE),
      sortValue: (r) => r.tax,
    },
  ];
  if (phone) {
    // A card is a tap target already; owner, last pop and pop count live on the moon's page.
    const dropped = new Set(['owner', 'last', 'pops']);
    return cols.filter((c) => !dropped.has(c.id));
  }
  cols.push({ id: 'go', header: '', align: 'right', className: 'w-6', render: () => <RowCaret /> });
  return grouped ? cols.filter((c) => c.id !== 'owner') : cols;
}

/** Group header of variant B: the refinery, who owns it, how many moons. */
function StationHeader({ rows }: { rows: readonly MoonRow[] }) {
  const first = rows[0];
  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
      <span className="font-semibold">{first.refinery}</span>
      <span className="text-xs text-text-dim">
        {first.owner === BOOK_CORP ? 'Our corp' : first.owner} · {rows.length}{' '}
        {rows.length === 1 ? 'moon' : 'moons'}
      </span>
      {first.archived && <Pill>Archived</Pill>}
    </span>
  );
}

/**
 * The all-moons list. Variant A: one flat sortable table, the station under
 * each name. Variant B: the same rows folded under their refinery.
 */
export function MoonsList({
  variant,
  archivedShown = false,
}: {
  variant: 'A' | 'B';
  archivedShown?: boolean;
}) {
  const phone = useIsPhone();
  const [filters, setFilters] = useState<Filters>({ owner: 'all', archived: archivedShown });
  const [query, setQuery] = useState('');
  const visible = MOONS.filter(
    (m) =>
      (filters.archived || !m.archived) &&
      (filters.owner === 'all' || (filters.owner === 'own') === (m.owner === BOOK_CORP)) &&
      `${m.moon} ${m.refinery} ${m.owner}`.toLowerCase().includes(query.toLowerCase())
  );
  const live = MOONS.filter((m) => m.newest === 'extracting' || m.newest === 'ready');
  const hidden = MOONS.filter((m) => m.archived).length;
  const grouped = variant === 'B';
  const active = [
    ...(filters.owner !== 'all'
      ? [
          {
            label: 'Owner',
            value: filters.owner === 'own' ? 'Our corp' : 'Moon owners',
            clear: () => ({ ...filters, owner: 'all' as const }),
          },
        ]
      : []),
    ...(filters.archived
      ? [
          {
            label: 'Stations',
            value: 'Archived shown',
            clear: () => ({ ...filters, archived: false }),
          },
        ]
      : []),
  ];
  return (
    <div className="space-y-4">
      <StatChips>
        <StatChip label="Moons" value={String(MOONS.length - 1)} />
        <StatChip label="Pops kept" value={String(MOONS.reduce((s, m) => s + m.pops, 0))} />
        <StatChip label="Next pop" value="16 Nov 09:05" />
        <StatChip label="Live chunks" value={String(live.length)} />
      </StatChips>
      <Panel title="Moons" padded={false}>
        <div className="p-3">
          <FilterBar<Filters>
            value={filters}
            onChange={setFilters}
            active={active}
            resultCount={visible.length}
            title="Filter moons"
            search={
              <SearchInput
                className="min-w-40 flex-1"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search moons, stations, owners…"
                aria-label="Search moons"
              />
            }
          >
            {(value, onChange) => (
              <>
                <FilterField label="Owner" stretch={false}>
                  <div role="group" aria-label="Owner" className="flex flex-wrap gap-2">
                    {(
                      [
                        ['all', 'All'],
                        ['own', 'Our corp'],
                        ['feeders', 'Moon owners'],
                      ] as const
                    ).map(([id, label]) => (
                      <FilterChip
                        key={id}
                        label={label}
                        selected={value.owner === id}
                        onToggle={() => onChange({ ...value, owner: id })}
                      />
                    ))}
                  </div>
                </FilterField>
                <FilterField label="Stations" stretch={false}>
                  <FilterChip
                    label={`Archived stations (${hidden})`}
                    selected={value.archived}
                    onToggle={() => onChange({ ...value, archived: !value.archived })}
                  />
                </FilterField>
              </>
            )}
          </FilterBar>
        </div>
        <DataTable
          label="Moons"
          columns={columns(grouped, phone)}
          rows={visible}
          rowKey={(r) => r.id}
          onRowClick={() => {}}
          rowClassName={() => 'group'}
          density="compact"
          defaultSort={{ columnId: 'next', direction: 'asc' }}
          mobileSort
          stackLayout="dense"
          {...(grouped
            ? {
                groupBy: {
                  key: (r: MoonRow) => r.refinery,
                  renderHeader: (rows: readonly MoonRow[]) => <StationHeader rows={rows} />,
                  defaultExpanded: () => true,
                  allWidths: true,
                  minSize: 1,
                },
              }
            : {})}
        />
      </Panel>
    </div>
  );
}
