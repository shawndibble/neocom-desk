import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts';
import {
  Button,
  DataTable,
  FilterChip,
  IconButton,
  PageHeader,
  Panel,
  ProgressBar,
  SearchInput,
  SlideOver,
  StatChip,
  StatChips,
  Tabs,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import { ChartTooltipShell } from '@/components/ui/ChartTooltipShell';
import { ColumnsPicker, Filter } from '@/components/ui/icons';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { formatIsk, formatIskCompact } from '@/lib/isk';
import { NewComponent } from './NewComponent';

/**
 * Proposal (#3908, revised): "Where the ISK went" moves out of the Journal's
 * body into a right side panel the Journal opens. The panel and the Journal
 * share one set of filters: a click in the panel (a ref type, or a day on its
 * chart) filters the Journal behind it, and the filter shows as a chip on the
 * Journal. The Character filter (This / All) moves up to the Journal itself,
 * so the list and the panel always cover the same Characters. On a phone the
 * Journal becomes a day-grouped, two-line list.
 *
 * New components in this mockup: `IskBreakdownPanel` (the side panel body),
 * `IskFlowChart` (daily In above / Out below the zero line, click a day to
 * filter; "Hide chart" removes it), `ActiveFilterRow` (removable chips plus
 * the filtered In/Out/Net line), and `BetweenYourCharactersRow`. Everything
 * else is an existing primitive.
 */

const ME = 2119876543;

interface Entry {
  id: number;
  day: string;
  time: string;
  character: string;
  type: string;
  description: string;
  amount: number;
  internal?: boolean;
}

const entries: Entry[] = [
  {
    id: 1,
    day: 'Fri 16 Oct',
    time: '06:42',
    character: 'Kestrel Vane',
    type: 'Bounty prizes',
    description: 'Bounty prizes for killing pirates in Hek',
    amount: 18_450_000,
  },
  {
    id: 2,
    day: 'Fri 16 Oct',
    time: '06:22',
    character: 'Orsa Tellemar',
    type: 'Bounty prizes',
    description: 'Bounty prizes for killing pirates in Rens',
    amount: 22_100_000,
  },
  {
    id: 3,
    day: 'Fri 16 Oct',
    time: '03:43',
    character: 'Kestrel Vane',
    type: 'Market transaction',
    description: 'Market: bought 3 x Hurricane',
    amount: -152_400_000,
  },
  {
    id: 4,
    day: 'Thu 15 Oct',
    time: '23:42',
    character: 'Orsa Tellemar',
    type: 'Bounty prizes',
    description: 'Bounty prizes for killing pirates in Rens',
    amount: 31_900_000,
  },
  {
    id: 5,
    day: 'Thu 15 Oct',
    time: '08:42',
    character: 'Kestrel Vane',
    type: 'Market escrow',
    description: 'Escrow for buy order',
    amount: -96_800_000,
  },
  {
    id: 6,
    day: 'Thu 15 Oct',
    time: '04:42',
    character: 'Kestrel Vane',
    type: 'Player donation',
    description: 'Orsa Tellemar donated cash to Kestrel Vane',
    amount: 250_000_000,
    internal: true,
  },
  {
    id: 7,
    day: 'Thu 15 Oct',
    time: '04:42',
    character: 'Orsa Tellemar',
    type: 'Player donation',
    description: 'Orsa Tellemar donated cash to Kestrel Vane',
    amount: -250_000_000,
    internal: true,
  },
  {
    id: 8,
    day: 'Wed 14 Oct',
    time: '08:42',
    character: 'Kestrel Vane',
    type: 'Brokers fee',
    description: 'Broker fee for order #6120945871',
    amount: -1_904_212,
  },
  {
    id: 9,
    day: 'Wed 14 Oct',
    time: '07:10',
    character: 'Orsa Tellemar',
    type: 'Bounty prizes',
    description: 'Bounty prizes for killing pirates in Rens',
    amount: 27_350_000,
  },
  {
    id: 10,
    day: 'Tue 13 Oct',
    time: '08:42',
    character: 'Kestrel Vane',
    type: 'Contract reward',
    description: 'Courier contract reward',
    amount: 42_000_000,
  },
];

interface TypeRow {
  type: string;
  net: number;
}

const typeRows: TypeRow[] = [
  { type: 'Bounty prizes', net: 412_350_000 },
  { type: 'Market transaction', net: -188_900_000 },
  { type: 'PLEX bought', net: -152_000_000 },
  { type: 'Contract reward', net: 42_000_000 },
  { type: 'Insurance', net: 21_600_000 },
  { type: 'Brokers fee', net: -6_120_000 },
  { type: 'Transaction tax', net: -3_870_000 },
];

interface DayPoint {
  day: string;
  in: number;
  out: number;
}

// 30 days of made-up flow: bounties most days, a few big buys.
const days: DayPoint[] = Array.from({ length: 30 }, (_, index) => {
  const dayOfMonth = index + 17;
  const label = dayOfMonth <= 30 ? `${dayOfMonth} Sep` : `${dayOfMonth - 30} Oct`;
  const bounty = ((index * 37) % 23) * 1_400_000 + 8_000_000;
  const buy =
    index % 6 === 2 ? 60_000_000 + ((index * 13) % 7) * 12_000_000 : ((index * 11) % 5) * 2_000_000;
  return { day: label, in: bounty, out: -buy };
});

const signed = (value: number) => (value > 0 ? `+${formatIsk(value)}` : formatIsk(value));
const tone = (value: number) => (value > 0 ? 'text-isk-pos' : value < 0 ? 'text-isk-neg' : '');

function FlowTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as DayPoint;
  return (
    <ChartTooltipShell>
      <div className="text-text">{point.day}</div>
      <div>In {formatIsk(point.in)}</div>
      <div>Out {formatIsk(-point.out)}</div>
      <div>Net {signed(point.in + point.out)}</div>
    </ChartTooltipShell>
  );
}

function IskFlowChart({
  selectedDay,
  selectedType,
}: {
  selectedDay: string | null;
  selectedType: string | null;
}) {
  // A ref type picked in the list drills the chart down to that type alone.
  const data = selectedType ? days.map((point) => ({ ...point, out: 0 })) : days;
  return (
    <NewComponent name="IskFlowChart">
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            stackOffset="sign"
            margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
          >
            <CartesianGrid vertical={false} stroke="var(--color-line)" strokeOpacity={0.5} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
              interval={6}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={44}
              tickFormatter={(value: number) => formatIskCompact(value)}
              tick={{ fontSize: '0.6875rem', fill: 'var(--color-text-dim)' }}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine y={0} stroke="var(--color-line-bright)" />
            <Tooltip content={FlowTooltip} cursor={{ fill: 'var(--color-panel-2)' }} />
            <Bar dataKey="in" stackId="flow" fill="var(--color-isk-pos)" radius={[4, 4, 0, 0]}>
              {data.map((point) => (
                <Cell
                  key={point.day}
                  fillOpacity={selectedDay && selectedDay !== point.day ? 0.35 : 1}
                />
              ))}
            </Bar>
            <Bar dataKey="out" stackId="flow" fill="var(--color-isk-neg)" radius={[4, 4, 0, 0]}>
              {data.map((point) => (
                <Cell
                  key={point.day}
                  fillOpacity={selectedDay && selectedDay !== point.day ? 0.35 : 1}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 flex flex-wrap gap-x-4 text-xs text-text-dim">
        <span>
          <span className="mr-1 inline-block size-2 rounded-xs bg-isk-pos" />
          In, above the line
        </span>
        <span>
          <span className="mr-1 inline-block size-2 rounded-xs bg-isk-neg" />
          Out, below the line
        </span>
        <span>Click a day to filter the Journal</span>
      </p>
    </NewComponent>
  );
}

const maxNet = Math.max(...typeRows.map((row) => Math.abs(row.net)));

const typeColumns: DataTableColumn<TypeRow>[] = [
  {
    id: 'type',
    header: 'Ref type',
    render: (row) => (
      <span className="block min-w-0">
        {row.type}
        <ProgressBar
          label={`${row.type} share`}
          value={Math.abs(row.net)}
          max={maxNet}
          size="xs"
          tone={row.net >= 0 ? 'success' : 'danger'}
          className="mt-1 w-full"
        />
      </span>
    ),
    sortValue: (row) => row.type,
  },
  {
    id: 'net',
    header: 'Net',
    align: 'right',
    className: 'tabular-nums',
    cellClassName: (row) => tone(row.net),
    render: (row) => signed(row.net),
    sortValue: (row) => row.net,
  },
];

function IskBreakdownPanel({
  open,
  chartShown,
  selectedType,
}: {
  open: boolean;
  chartShown: boolean;
  selectedType: string | null;
}) {
  const [showChart, setShowChart] = useState(chartShown);
  return (
    <SlideOver
      open={open}
      onClose={() => {}}
      title="Where the ISK went"
      subtitle="All characters · last 30 days · follows the Journal's filters"
    >
      <NewComponent name="IskBreakdownPanel">
        <div className="space-y-4">
          <StatChips>
            <StatChip
              label="In"
              value={<span className="text-isk-pos">{formatIsk(532_750_000)}</span>}
            />
            <StatChip
              label="Out"
              value={<span className="text-isk-neg">{formatIsk(449_690_000)}</span>}
            />
            <StatChip
              label="Net"
              emphasis
              value={<span className="text-isk-pos">+83,060,000</span>}
            />
          </StatChips>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest uppercase text-text-dim">
              Daily flow{selectedType ? ` · ${selectedType}` : ''}
            </span>
            <Button size="sm" onClick={() => setShowChart((shown) => !shown)}>
              {showChart ? 'Hide chart' : 'Show chart'}
            </Button>
          </div>
          {showChart && <IskFlowChart selectedDay={null} selectedType={selectedType} />}
          <DataTable
            label="Where the ISK went, by ref type"
            columns={typeColumns}
            rows={typeRows}
            rowKey={(row) => row.type}
            density="compact"
            responsive="table"
            defaultSort={{ columnId: 'net', direction: 'desc' }}
            selectedRowKey={selectedType}
            onRowClick={() => {}}
          />
          <NewComponent name="BetweenYourCharactersRow">
            <div className="flex items-start justify-between gap-4 text-sm text-text-dim">
              <span>
                Between your Characters · 7 entries
                <span className="block text-xs">
                  Left out of In and Out: both sides are your Characters. ISK moved through a
                  corporation wallet still counts.
                </span>
              </span>
              <span className="tabular-nums">{formatIsk(240_000_000)}</span>
            </div>
          </NewComponent>
        </div>
      </NewComponent>
    </SlideOver>
  );
}

const journalColumns: DataTableColumn<Entry>[] = [
  {
    id: 'date',
    header: 'Date',
    render: (row) => (
      <>
        <span className="max-sm:hidden">{row.day}, </span>
        {row.time}
      </>
    ),
    sortValue: (row) => row.id,
  },
  {
    id: 'character',
    header: 'Character',
    render: (row) => row.character,
  },
  { id: 'type', header: 'Type', render: (row) => row.type, sortValue: (row) => row.type },
  {
    id: 'description',
    header: 'Description',
    primary: true,
    render: (row) => (
      <>
        {row.description}
        {row.internal && (
          <span className="block text-xs text-text-dim">Between your Characters</span>
        )}
      </>
    ),
  },
  {
    id: 'amount',
    header: 'Amount',
    align: 'right',
    className: 'tabular-nums',
    cardCorner: true,
    cellClassName: (row) => (row.internal ? 'text-text-dim' : tone(row.amount)),
    render: (row) => signed(row.amount),
    sortValue: (row) => row.amount,
  },
];

function JournalPage({
  filtered,
  panelOpen,
  chartShown,
}: {
  filtered: boolean;
  panelOpen: boolean;
  chartShown: boolean;
}) {
  const tabsId = useTabsId();
  const rows = filtered ? entries.filter((row) => row.type === 'Bounty prizes') : entries;
  return (
    <div className={`space-y-3 px-4 py-4 ${panelOpen ? 'md:pr-[26rem]' : ''}`}>
      <PageHeader title="Wallet" meta={<span className="text-xs text-text-dim">just now</span>} />
      <Tabs
        tabsId={tabsId}
        label="Wallet views"
        value="journal"
        onChange={() => {}}
        tabs={[
          { id: 'balance', label: 'Balance' },
          { id: 'journal', label: 'Journal' },
          { id: 'lp', label: 'LP Store' },
        ]}
      />
      <Panel
        title="Journal"
        actions={
          <CharacterFilterControl
            activeCharacterId={ME}
            value="all"
            onChange={() => {}}
            characterCount={2}
          />
        }
      >
        <div className="space-y-2 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              className="min-w-40 flex-1"
              value=""
              onChange={() => {}}
              placeholder="Search description…"
              aria-label="Search description"
            />
            <Button>Where the ISK went</Button>
            <IconButton label="Columns" icon={<ColumnsPicker />} />
            <IconButton label="Filters" icon={<Filter />} />
          </div>
          <NewComponent name="ActiveFilterRow">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs tabular-nums">
              {filtered && (
                <FilterChip label="Type: Bounty prizes ×" selected onToggle={() => {}} />
              )}
              <span className="text-text-dim">{rows.length} entries</span>
              <span>
                In{' '}
                <span className="text-isk-pos">
                  {formatIsk(filtered ? 99_800_000 : 391_800_000)}
                </span>
              </span>
              <span>
                Out <span className="text-isk-neg">{formatIsk(filtered ? 0 : 251_104_212)}</span>
              </span>
              <span>
                Net{' '}
                <span className="text-isk-pos">{filtered ? '+99,800,000' : '+140,695,788'}</span>
              </span>
              <span className="text-text-dim">7 entries between your Characters left out</span>
            </div>
          </NewComponent>
        </div>
        <DataTable
          label="Journal"
          columns={journalColumns}
          rows={rows}
          rowKey={(row) => row.id}
          density="compact"
          stackLayout="dense"
          mobileSort
          groupBy={{
            key: (row) => row.day,
            minSize: 1,
            defaultExpanded: () => true,
            renderHeader: (group) => {
              const net = group
                .filter((row) => !row.internal)
                .reduce((sum, row) => sum + row.amount, 0);
              return (
                <span className="flex w-full justify-between gap-4 tabular-nums">
                  <span>{group[0].day}</span>
                  <span className={tone(net)}>{signed(net)}</span>
                </span>
              );
            },
          }}
        />
      </Panel>
      <IskBreakdownPanel
        open={panelOpen}
        chartShown={chartShown}
        selectedType={filtered ? 'Bounty prizes' : null}
      />
    </div>
  );
}

const meta = {
  title: 'mockups/WalletJournalAllCharacters',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/wallet/journal' } },
  render: () => <JournalPage filtered panelOpen chartShown />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** @summary The side panel open over the Journal, Bounty prizes picked: the Journal behind shows only bounties and the chip says so. New components: IskBreakdownPanel, IskFlowChart, ActiveFilterRow, BetweenYourCharactersRow. */
export const PanelOpen: Story = {};

/** @summary The same, with the chart hidden: the panel is the totals and the ref-type list only. */
export const ChartHidden: Story = {
  render: () => <JournalPage filtered panelOpen chartShown={false} />,
};

/** @summary The Journal with the panel closed and no filter: All Characters, the filtered In/Out/Net line, own-Character transfers marked. */
export const JournalOnly: Story = {
  render: () => <JournalPage filtered={false} panelOpen={false} chartShown />,
};

/** @summary Phone: the Journal as a day-grouped two-line list, each day with its net. */
export const JournalPhone: Story = {
  render: () => <JournalPage filtered={false} panelOpen={false} chartShown />,
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};

/** @summary Phone: the panel as a full-height sheet. */
export const PanelPhone: Story = {
  globals: { viewport: { value: 'mobile1', isRotated: false } },
};
