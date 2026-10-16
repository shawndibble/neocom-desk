import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Caret, DataTable, FilterChip, SearchInput, type DataTableColumn } from '@/components/ui';
import { Fittings } from '@/routes/Fittings';
import { haulingFixtureRoutes } from '@/storybook/haulingFixtures';
import { NewComponent } from './NewComponent';

/**
 * Proposal: a "Your Characters" section in an open Fitting's stats column,
 * beside "What to train". Built for 20+ Characters: one sortable table, the
 * closest to flying first, filter chips for Can fly / Can't fly, a search box,
 * and each row opening that Character's missing skills in place.
 *
 * New components in this mockup: `YourCharactersSection` (the section body:
 * chips, search, table). The section row, `DataTable` (with its
 * expand-in-place rows), `FilterChip` and `SearchInput` are existing.
 */

const FIT_CODE = '2.yzIyq7G2trauAQG3nNTUElUjA4_SoqLM5MS8VAA';

interface Gap {
  skill: string;
  time: string;
}

interface Row {
  name: string;
  /** Seconds left to train; 0 = can fly now. */
  seconds: number;
  gaps: Gap[];
}

const gap = (skill: string, time: string): Gap => ({ skill, time });
const H = 3600;
const D = 24 * H;

const rows: Row[] = [
  { name: 'Kestrel Vane', seconds: 0, gaps: [] },
  { name: 'Orsa Tellemar', seconds: 0, gaps: [] },
  { name: 'Brannoc Hesk', seconds: 0, gaps: [] },
  { name: 'Ilse Marrow', seconds: 0, gaps: [] },
  { name: 'Tavik Orun', seconds: 0, gaps: [] },
  { name: 'Selka Darrin', seconds: 0, gaps: [] },
  { name: 'Joren Vasq', seconds: 0, gaps: [] },
  {
    name: 'Mira Kolhaan',
    seconds: 5 * H + 20 * 60,
    gaps: [gap('Projectile Turret IV', '5h 20m')],
  },
  {
    name: 'Dace Ombre',
    seconds: 19 * H,
    gaps: [gap('Medium Projectile Turret III', '7h 10m'), gap('Hull Upgrades III', '11h 50m')],
  },
  {
    name: 'Venn Askari',
    seconds: 2 * D + 4 * H,
    gaps: [gap('Minmatar Battlecruiser III', '1d 9h'), gap('Shield Upgrades IV', '19h')],
  },
  {
    name: 'Rhea Calloway',
    seconds: 3 * D + 1 * H,
    gaps: [
      gap('Minmatar Battlecruiser II', '9h'),
      gap('Medium Projectile Turret IV', '1d 18h'),
      gap('Gunnery IV', '22h'),
    ],
  },
  {
    name: 'Oskar Fenn',
    seconds: 4 * D + 12 * H,
    gaps: [gap('Battlecruisers III', '2d 1h'), gap('Weapon Upgrades IV', '2d 11h')],
  },
  {
    name: 'Lissa Morrow',
    seconds: 6 * D + 3 * H,
    gaps: [
      gap('Minmatar Battlecruiser III', '1d 9h'),
      gap('Medium Projectile Turret IV', '1d 18h'),
      gap('Hull Upgrades IV', '1d 20h'),
      gap('Gunnery IV', '22h'),
    ],
  },
  { name: 'Quen Hadley', seconds: 8 * D, gaps: [gap('Battlecruisers IV', '8d')] },
  {
    name: 'Teodor Voss',
    seconds: 11 * D + 6 * H,
    gaps: [gap('Minmatar Battlecruiser IV', '6d 4h'), gap('Shield Management IV', '5d 2h')],
  },
  {
    name: 'Yara Benn',
    seconds: 14 * D,
    gaps: [gap('Battlecruisers IV', '8d'), gap('Medium Projectile Turret IV', '6d')],
  },
  {
    name: 'Corvin Dask',
    seconds: 19 * D + 2 * H,
    gaps: [
      gap('Spaceship Command III', '9h'),
      gap('Minmatar Cruiser III', '1d 2h'),
      gap('Battlecruisers IV', '8d'),
      gap('Gunnery IV', '22h'),
      gap('Medium Projectile Turret IV', '6d'),
    ],
  },
  {
    name: 'Nadia Pell',
    seconds: 23 * D,
    gaps: [
      gap('Minmatar Cruiser IV', '5d'),
      gap('Battlecruisers IV', '8d'),
      gap('Gunnery V', '10d'),
    ],
  },
  {
    name: 'Halric Stone',
    seconds: 31 * D + 9 * H,
    gaps: [
      gap('Minmatar Frigate IV', '2d'),
      gap('Minmatar Cruiser IV', '5d'),
      gap('Battlecruisers IV', '8d'),
      gap('Medium Projectile Turret IV', '6d'),
      gap('Weapon Upgrades IV', '2d 11h'),
      gap('Gunnery V', '10d'),
    ],
  },
  { name: 'Pip Arkwright', seconds: -1, gaps: [] },
];

function formatTime(seconds: number): string {
  const days = Math.floor(seconds / D);
  const hours = Math.floor((seconds % D) / H);
  const minutes = Math.floor((seconds % H) / 60);
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

type Filter = 'all' | 'fly' | 'cant';

function YourCharactersBody() {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const flyCount = rows.filter((row) => row.seconds === 0).length;
  const cantCount = rows.filter((row) => row.seconds > 0).length;
  const shown = useMemo(
    () =>
      rows.filter(
        (row) =>
          (filter === 'all' || (filter === 'fly' ? row.seconds === 0 : row.seconds > 0)) &&
          row.name.toLowerCase().includes(query.toLowerCase())
      ),
    [filter, query]
  );
  const columns: DataTableColumn<Row>[] = [
    { id: 'name', header: 'Character', render: (row) => row.name, sortValue: (row) => row.name },
    {
      id: 'missing',
      header: 'Missing',
      align: 'right',
      className: 'tabular-nums',
      render: (row) =>
        row.seconds < 0 ? (
          <span className="text-text-dim">Skills not loaded</span>
        ) : row.seconds === 0 ? (
          <span className="text-success">Can fly</span>
        ) : (
          `${row.gaps.length} ${row.gaps.length === 1 ? 'skill' : 'skills'}`
        ),
      sortValue: (row) => (row.seconds < 0 ? 99 : row.gaps.length),
    },
    {
      id: 'time',
      header: 'To train',
      align: 'right',
      className: 'tabular-nums',
      render: (row) => (row.seconds > 0 ? formatTime(row.seconds) : '—'),
      sortValue: (row) => (row.seconds < 0 ? Number.MAX_SAFE_INTEGER : row.seconds),
    },
  ];
  return (
    <NewComponent name="YourCharactersSection">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            label="All"
            count={rows.length}
            selected={filter === 'all'}
            onToggle={() => setFilter('all')}
          />
          <FilterChip
            label="Can fly"
            count={flyCount}
            selected={filter === 'fly'}
            onToggle={() => setFilter('fly')}
          />
          <FilterChip
            label="Can't fly"
            count={cantCount}
            selected={filter === 'cant'}
            onToggle={() => setFilter('cant')}
          />
        </div>
        <SearchInput
          className="w-full"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search Characters…"
          aria-label="Search Characters"
        />
        <DataTable
          label="Your Characters for this Fitting"
          columns={columns}
          rows={shown}
          rowKey={(row) => row.name}
          density="compact"
          responsive="table"
          defaultSort={{ columnId: 'time', direction: 'asc' }}
          expandableRow={{
            renderDetail: (row) =>
              row.gaps.length === 0 ? null : (
                <ul className="space-y-1 py-1 text-xs">
                  {row.gaps.map((g) => (
                    <li key={g.skill} className="flex justify-between gap-4">
                      <span>{g.skill}</span>
                      <span className="tabular-nums text-text-dim">{g.time}</span>
                    </li>
                  ))}
                </ul>
              ),
          }}
        />
      </div>
    </NewComponent>
  );
}

/** A section row in the stats column's own markup, holding the proposal. */
function YourCharactersSectionRow() {
  return (
    <section className="border-b border-line">
      <div className="flex min-h-11 items-center gap-2 pr-3 pl-3 md:min-h-9">
        <h3 className="min-w-0 flex-1 text-xs font-semibold tracking-widest uppercase">
          <span className="inline-flex items-center gap-2">
            <Caret expanded />
            Your Characters
          </span>
        </h3>
        <span className="shrink-0 text-sm font-semibold tabular-nums">7 of 20 can fly</span>
      </div>
      <div className="space-y-3 p-3 text-xs">
        <YourCharactersBody />
      </div>
    </section>
  );
}

/**
 * Puts the proposed section into the real stats column, right under "What to
 * train", once the page has rendered it.
 */
function IntoStatsColumn({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    let made: HTMLElement | null = null;
    const find = () => {
      if (made) return;
      const anchor = [
        ...document.querySelectorAll<HTMLButtonElement>('h3 > button[aria-expanded]'),
      ].find((button) => button.textContent?.trim().toLowerCase() === 'what to train');
      const section = anchor?.closest('section');
      if (!section?.parentElement) return;
      made = document.createElement('div');
      section.parentElement.insertBefore(made, section.nextSibling);
      setHost(made);
    };
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    find();
    return () => {
      observer.disconnect();
      made?.remove();
    };
  }, []);
  return host ? createPortal(children, host) : null;
}

const meta = {
  title: 'mockups/FittingCanFlyByCharacter',
  tags: ['!manifest'],
  parameters: {
    layout: 'fullscreen',
    // The open Fitting reads the active Character's skills, queue and implants.
    shell: { path: `/fittings/edit?f=${FIT_CODE}`, routes: haulingFixtureRoutes },
  },
  render: () =>
    // Under Vitest the open Fitting's SDE reads are relative URLs node can't
    // fetch, so the story smoke test renders the proposal on its own. The
    // screenshot (Storybook) gets the real page around it.
    import.meta.env.MODE === 'test' ? (
      <YourCharactersSectionRow />
    ) : (
      <>
        <Fittings />
        <IntoStatsColumn>
          <YourCharactersSectionRow />
        </IntoStatsColumn>
      </>
    ),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary An open Fitting's stats column with a "Your Characters" section for 20 Characters: chips, search, closest first. New component: YourCharactersSection. */
export const Proposed: Story = {};

/** @summary The proposal in the phone shell. */
export const ProposedPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
