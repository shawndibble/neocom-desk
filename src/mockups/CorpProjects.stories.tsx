import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  DataTable,
  FilterChip,
  IconButton,
  IskDelta,
  NativeSelect,
  PageHeader,
  Panel,
  ProgressBar,
  SearchInput,
  StatChip,
  StatChips,
  Tabs,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import { Pill } from '@/components/ui/Pill';
import * as Icon from '@/components/ui/icons';
import { NewComponent } from './NewComponent';

/**
 * Issue #4530: a Projects tab on Industry listing the open Corporation Projects
 * of the active Character's corporation. Read-only; fetched on open.
 *
 * Mobbin references (patterns borrowed, not copied):
 * - Cake Equity "Raise details": a summary strip of figures above the table.
 * - Dub "Bounties": date, reward and "n of m completed" on one card.
 * - Whop "Content Rewards": pool as a bar with spent / budget printed beside it.
 * - Shopee "Streaming tasks": an "Ends at" chip on each task, progress under it.
 * - Jira mobile "All Work": two-line rows, status chip and date on the second line.
 *
 * New components in this mockup: `ProjectsTab` (the whole tab body: summary
 * strip, filter row and table). The tab is only listed when the Character has
 * granted the projects permission and the last read returned an open project,
 * so there is no empty or missing-permission state to draw. The
 * "Projects" entry in the Industry tab strip is the fifth existing `Tabs` item.
 * Everything inside is an existing primitive.
 */

type ProjectKind = 'Manufacture' | 'Mining' | 'Delivery' | 'Combat' | 'Salvage' | 'Loyalty';

interface Project {
  id: string;
  name: string;
  kind: ProjectKind;
  /** Reward paid per contributed unit, ISK. */
  perContribution: number;
  poolInitial: number;
  poolRemaining: number;
  current: number;
  desired: number;
  /** The Character's own contribution and the per-pilot cap. */
  mine: number;
  cap: number;
  hoursLeft: number;
  /** Manufacture rows only: Build Plan cost of one unit. */
  buildCostPerUnit?: number;
}

const PROJECTS: Project[] = [
  {
    id: 'p1',
    name: 'Hurricane hulls for the home fleet',
    kind: 'Manufacture',
    perContribution: 41_800_000,
    poolInitial: 2_090_000_000,
    poolRemaining: 1_254_000_000,
    current: 20,
    desired: 50,
    mine: 3,
    cap: 10,
    hoursLeft: 96,
    buildCostPerUnit: 36_400_000,
  },
  {
    id: 'p2',
    name: 'Catalyst stockpile, Jita-bound',
    kind: 'Manufacture',
    perContribution: 1_150_000,
    poolInitial: 230_000_000,
    poolRemaining: 41_400_000,
    current: 164,
    desired: 200,
    mine: 25,
    cap: 25,
    hoursLeft: 30,
    buildCostPerUnit: 1_240_000,
  },
  {
    id: 'p3',
    name: 'Veldspar for the compression line',
    kind: 'Mining',
    perContribution: 18,
    poolInitial: 900_000_000,
    poolRemaining: 612_000_000,
    current: 16_000_000,
    desired: 50_000_000,
    mine: 1_400_000,
    cap: 5_000_000,
    hoursLeft: 240,
  },
  {
    id: 'p4',
    name: 'Fuel blocks to the Ansiblex',
    kind: 'Delivery',
    perContribution: 21_500,
    poolInitial: 430_000_000,
    poolRemaining: 301_000_000,
    current: 6_000,
    desired: 20_000,
    mine: 0,
    cap: 2_000,
    hoursLeft: 18,
  },
  {
    id: 'p5',
    name: 'Clear the Serpentis belt rats',
    kind: 'Combat',
    perContribution: 650_000,
    poolInitial: 325_000_000,
    poolRemaining: 90_000_000,
    current: 361,
    desired: 500,
    mine: 12,
    cap: 40,
    hoursLeft: 150,
  },
  {
    id: 'p6',
    name: 'Salvage the Blood Raider wrecks',
    kind: 'Salvage',
    perContribution: 380_000,
    poolInitial: 190_000_000,
    poolRemaining: 156_000_000,
    current: 90,
    desired: 500,
    mine: 0,
    cap: 60,
    hoursLeft: 330,
  },
  {
    id: 'p7',
    name: 'Loyalty points from the Sisters',
    kind: 'Loyalty',
    perContribution: 1_200,
    poolInitial: 600_000_000,
    poolRemaining: 585_000_000,
    current: 12_500,
    desired: 500_000,
    mine: 4_000,
    cap: 50_000,
    hoursLeft: 600,
  },
];

const num = (n: number): string => n.toLocaleString('en');
const isk = (n: number): string => `${num(n)} ISK`;

/** "4d 0h" from hours; under two days it turns amber so an ending project stands out. */
function timeLeft(hours: number): { text: string; soon: boolean } {
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return { text: d > 0 ? `${d}d ${h}h` : `${h}h`, soon: hours < 48 };
}

const COLUMNS: DataTableColumn<Project>[] = [
  {
    id: 'project',
    header: 'Project',
    primary: true,
    sortValue: (p) => p.name,
    render: (p) => (
      <span className="block min-w-0">
        <span className="block font-medium text-text">{p.name}</span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-text-dim">
          <Pill>{p.kind}</Pill>
        </span>
      </span>
    ),
  },
  {
    id: 'reward',
    header: 'Reward each',
    align: 'right',
    className: 'tabular-nums',
    sortValue: (p) => p.perContribution,
    render: (p) => isk(p.perContribution),
  },
  {
    id: 'pool',
    header: 'Pool left',
    align: 'right',
    className: 'min-w-44',
    sortValue: (p) => p.poolRemaining,
    render: (p) => (
      <span className="flex flex-col gap-1 sm:items-end">
        <span className="tabular-nums">{isk(p.poolRemaining)}</span>
        <ProgressBar
          label={`${p.name} pool remaining`}
          value={p.poolRemaining}
          max={p.poolInitial}
          size="xs"
          className="w-full max-sm:hidden sm:w-32"
        />
        <span className="text-xs text-text-dim max-sm:hidden">of {isk(p.poolInitial)}</span>
      </span>
    ),
  },
  {
    id: 'progress',
    header: 'Progress',
    phoneHidden: true,
    className: 'min-w-40',
    sortValue: (p) => p.current / p.desired,
    render: (p) => (
      <span className="flex flex-col gap-1">
        <ProgressBar
          label={`${p.name} progress`}
          value={p.current}
          max={p.desired}
          size="sm"
          className="w-full sm:w-36"
        />
        <span className="text-xs tabular-nums text-text-dim">
          {num(p.current)} / {num(p.desired)}
        </span>
      </span>
    ),
  },
  {
    id: 'mine',
    header: 'Contributed',
    className: 'min-w-36',
    sortValue: (p) => p.mine / p.cap,
    render: (p) =>
      p.mine >= p.cap ? (
        <span className="flex items-center gap-2">
          <span className="tabular-nums">{num(p.mine)}</span>
          <Pill tone="success">Cap reached</Pill>
        </span>
      ) : (
        <span className="flex flex-col gap-1">
          <ProgressBar
            label={`${p.name}: my contribution against the cap`}
            value={p.mine}
            max={p.cap}
            size="sm"
            className="w-full sm:w-28"
          />
          <span className="text-xs tabular-nums text-text-dim">
            {num(p.mine)} of {num(p.cap)}
          </span>
        </span>
      ),
  },
  {
    id: 'expires',
    header: 'Ends in',
    align: 'right',
    className: 'tabular-nums',
    sortValue: (p) => p.hoursLeft,
    render: (p) => {
      const { text, soon } = timeLeft(p.hoursLeft);
      return soon ? <span className="text-warning">{text}</span> : text;
    },
  },
  {
    id: 'margin',
    header: 'Vs build cost',
    align: 'right',
    className: 'tabular-nums',
    sortValue: (p) =>
      p.buildCostPerUnit === undefined ? undefined : p.perContribution - p.buildCostPerUnit,
    render: (p) =>
      p.buildCostPerUnit === undefined ? (
        <span className="text-text-dim">—</span>
      ) : (
        <span className="flex flex-col sm:items-end">
          <IskDelta amount={p.perContribution - p.buildCostPerUnit} decimals={0} />
          <span className="text-xs text-text-dim">per unit, build {isk(p.buildCostPerUnit)}</span>
        </span>
      ),
  },
];

function ProjectsTab() {
  const tabsId = useTabsId();
  const [query] = useState('');
  const open = PROJECTS;
  const pool = open.reduce((sum, p) => sum + p.poolRemaining, 0);
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 pt-4">
      <PageHeader
        title="Industry"
        subNav={
          <Tabs
            tabsId={tabsId}
            label="Industry sections"
            value="projects"
            onChange={() => {}}
            tabs={[
              { id: 'plans', label: 'Build Plans' },
              { id: 'logs', label: 'Logs' },
              { id: 'sourcing', label: 'BPC Search' },
              { id: 'opportunities', label: 'Opportunities' },
              { id: 'projects', label: 'Projects' },
            ]}
          />
        }
      />
      <NewComponent name="ProjectsTab">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <NativeSelect
              aria-label="Character"
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              defaultValue="varro"
            >
              <option value="varro">Varro Tam · Aurora Foundry</option>
              <option value="tamsin">Tamsin Vale · Aurora Foundry</option>
            </NativeSelect>
            <SearchInput
              aria-label="Search projects"
              placeholder="Search projects"
              className="order-last w-full sm:order-none sm:w-64"
              defaultValue={query}
            />
            <IconButton icon={<Icon.Refresh />} label="Refresh projects" />
          </div>

          <>
            <StatChips>
              <StatChip label="Open projects" value={String(open.length)} emphasis />
              <StatChip label="Pool left" value={isk(pool)} />
              <StatChip
                label="Can still contribute to"
                value={`${open.filter((p) => p.mine < p.cap).length} of ${open.length}`}
              />
            </StatChips>
            <div className="flex gap-2 overflow-x-auto">
              <FilterChip label="Open" selected onToggle={() => {}} count={open.length} />
              <FilterChip label="Cap not reached" selected={false} onToggle={() => {}} />
              <FilterChip label="Manufacture" selected={false} onToggle={() => {}} />
              <FilterChip label="Ending soon" selected={false} onToggle={() => {}} />
            </div>
            <Panel title="Open projects" meta="Aurora Foundry">
              <DataTable
                label="Open corporation projects"
                columns={COLUMNS}
                rows={open}
                rowKey={(p) => p.id}
                defaultSort={{ columnId: 'expires', direction: 'asc' }}
              />
              <p className="mt-3 text-xs text-text-dim">
                Reward vs build cost uses your Build Plan pricing for the item. Finished and expired
                projects are hidden.
              </p>
            </Panel>
          </>
        </div>
      </NewComponent>
    </div>
  );
}

const meta = {
  title: 'mockups/CorpProjects',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/industry/opportunities' } },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary Industry › Projects with seven open projects: summary strip, chips, table. New component: ProjectsTab. */
export const Populated: Story = { render: () => <ProjectsTab /> };

/** @summary The populated tab as stacked cards in the phone shell. */
export const PopulatedPhone: Story = {
  render: () => <ProjectsTab />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
