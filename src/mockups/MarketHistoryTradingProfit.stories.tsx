import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  DataTable,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Tabs,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import * as Icon from '@/components/ui/icons';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { cx } from '@/lib/cx';
import { formatIsk, formatMarketIsk } from '@/lib/isk';
import { NewComponent } from './NewComponent';

/**
 * Proposal (T8, History part): Market › History shows trading profit for the
 * date range. The summary strip gains two figures: Margin, with how many sales
 * found their buys ("41 of 45 sales matched"), and Broker fees, kept separate
 * rather than subtracted. The page gains the Character filter (inline
 * in the existing filter row, no new row) with "All characters": FIFO then
 * pools buys across every Character in the view, rows and strip alike. When
 * the wallet history saved on this device is shorter than the range, the
 * strip's range line says "since <date>".
 *
 * New components in this mockup: `TradingProfitFigures` (Margin and Broker
 * fees in the strip), `ArchiveCoverageNote` ("since 4 Oct" on the range
 * line). The Character filter is the existing `CharacterFilterControl`, unmarked; it is
 * new to History, which has none today. Everything else is an existing primitive
 * or the page's own markup copied from `TransactionsPanel`,
 * and `TransactionsSummaryStrip`.
 */

const ME = 2119876543;

interface Fill {
  id: number;
  date: string;
  character: string;
  item: string;
  buy: boolean;
  quantity: number;
  unitPrice: number;
  margin?: number | null;
}

const FILLS: Fill[] = [
  {
    id: 1,
    date: '2026-10-16 07:42',
    character: 'Kestrel Vane',
    item: 'Hammerhead II',
    buy: false,
    quantity: 20,
    unitPrice: 1_142_000,
    margin: 4_620_000,
  },
  {
    id: 2,
    date: '2026-10-16 06:10',
    character: 'Orsa Tellemar',
    item: 'Antimatter Charge S',
    buy: false,
    quantity: 400_000,
    unitPrice: 6.42,
    margin: 102_400,
  },
  {
    id: 3,
    date: '2026-10-15 22:31',
    character: 'Kestrel Vane',
    item: 'Hobgoblin II',
    buy: true,
    quantity: 60,
    unitPrice: 571_000,
  },
  {
    id: 4,
    date: '2026-10-15 19:05',
    character: 'Orsa Tellemar',
    item: 'Medium Shield Extender II',
    buy: false,
    quantity: 12,
    unitPrice: 1_930_000,
    margin: 3_310_000,
  },
  {
    id: 5,
    date: '2026-10-15 11:48',
    character: 'Kestrel Vane',
    item: 'Damage Control II',
    buy: false,
    quantity: 8,
    unitPrice: 632_000,
    margin: 690_000,
  },
  {
    id: 6,
    date: '2026-10-14 23:12',
    character: 'Orsa Tellemar',
    item: 'Warrior II',
    buy: false,
    quantity: 30,
    unitPrice: 488_000,
    margin: -705_000,
  },
  {
    id: 7,
    date: '2026-10-14 18:40',
    character: 'Kestrel Vane',
    item: 'Nanite Repair Paste',
    buy: false,
    quantity: 1_800,
    unitPrice: 12_340,
    margin: 4_390_000,
  },
  {
    id: 8,
    date: '2026-10-14 09:02',
    character: 'Orsa Tellemar',
    item: 'Hail S',
    buy: true,
    quantity: 10_000,
    unitPrice: 512,
  },
  {
    id: 9,
    date: '2026-10-13 21:16',
    character: 'Kestrel Vane',
    item: 'Inertial Stabilizer II',
    buy: false,
    quantity: 4,
    unitPrice: 970_100,
    margin: null,
  },
  {
    id: 10,
    date: '2026-10-13 15:55',
    character: 'Orsa Tellemar',
    item: 'Multispectrum Energized Membrane II',
    buy: false,
    quantity: 7,
    unitPrice: 3_149_900,
    margin: 2_680_000,
  },
];

/** `NewComponent`, wide enough that its label never overlaps a short control. */
function Mark({ name, children }: { name: string; children: ReactNode }) {
  return (
    <NewComponent name={name}>
      <div className="min-w-72">{children}</div>
    </NewComponent>
  );
}

const tone = (value: number) => (value > 0 ? 'text-isk-pos' : value < 0 ? 'text-isk-neg' : '');

const fillColumns = (allCharacters: boolean): DataTableColumn<Fill>[] => [
  {
    id: 'date',
    header: 'Date',
    className: 'whitespace-nowrap text-text-dim',
    render: (f) => f.date,
  },
  ...(allCharacters
    ? [
        {
          id: 'character',
          header: 'Character',
          phoneHidden: true,
          render: (f: Fill) => f.character,
        },
      ]
    : []),
  {
    id: 'item',
    header: 'Item',
    stickyStart: true,
    render: (f) => <span className={entityLinkClassName()}>{f.item}</span>,
  },
  { id: 'side', header: 'Side', phoneHidden: true, render: (f) => (f.buy ? 'Buy' : 'Sell') },
  {
    id: 'quantity',
    header: 'Quantity',
    align: 'right',
    className: 'tabular-nums',
    render: (f) => f.quantity.toLocaleString(),
  },
  {
    id: 'unitPrice',
    header: 'Unit price',
    align: 'right',
    className: 'tabular-nums',
    render: (f) => formatMarketIsk(f.unitPrice),
  },
  {
    id: 'total',
    header: 'Total',
    align: 'right',
    className: 'tabular-nums',
    cellClassName: (f) => (f.buy ? 'text-isk-neg' : 'text-isk-pos'),
    render: (f) => formatIsk(Math.round((f.buy ? -1 : 1) * f.quantity * f.unitPrice)),
  },
  {
    id: 'margin',
    header: 'Margin',
    phoneHidden: true,
    align: 'right',
    className: 'tabular-nums',
    cellClassName: (f) => (f.margin ? tone(f.margin) : 'text-text-dim'),
    render: (f) => (f.buy ? null : f.margin == null ? '—' : formatIsk(f.margin)),
  },
];

function Figure({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className: string;
}) {
  return (
    <div className={cx('flex flex-col gap-0.5', className)}>
      <dt className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
        {label}
      </dt>
      <dd className="text-sm font-semibold">{value}</dd>
      {sub && <dd className="text-xs text-text-dim">{sub}</dd>}
    </div>
  );
}

/** `TransactionsSummaryStrip`, plus Margin, Broker fees and the coverage note when proposed. */
function SummaryStrip({ proposed }: { proposed: boolean }) {
  return (
    <section
      aria-label="Transactions summary"
      className="flex flex-col gap-2 rounded-xs border border-line bg-panel/85 p-3 backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-dim">
        <span>17 Sep 2026 – 16 Oct 2026</span>
        {proposed && (
          <Mark name="ArchiveCoverageNote">
            <span className="text-xs text-warning">
              ·{' '}
              <HintText content="The wallet history saved on this device starts 4 Oct 2026, so Margin and Broker fees count from then.">
                since 4 Oct
              </HintText>
            </span>
          </Mark>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <dl className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2 tabular-nums">
          <Figure label="Sold" value="+412,880,500" className="text-isk-pos" />
          <Figure label="Bought" value="-298,330,000" className="text-isk-neg" />
          <Figure label="Net" value="+114,550,500" className="text-isk-pos" />
        </dl>
        {proposed && (
          <Mark name="TradingProfitFigures">
            <dl className="flex flex-wrap gap-x-6 gap-y-2 tabular-nums">
              <Figure
                label="Margin"
                value="+120,412,880"
                sub="41 of 45 sales matched"
                className="text-isk-pos"
              />
              <Figure label="Broker fees" value="-8,104,550" className="text-isk-neg" />
            </dl>
          </Mark>
        )}
      </div>
    </section>
  );
}

function FilterRow({ proposed }: { proposed: boolean }) {
  let character: ReactNode = null;
  if (proposed) {
    character = (
      <CharacterFilterControl
        activeCharacterId={ME}
        value="all"
        onChange={() => {}}
        characterCount={2}
      />
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
      <SearchInput
        className="min-w-48 flex-1"
        value=""
        onChange={() => {}}
        placeholder="Search item…"
        aria-label="Search item"
      />
      {character}
      <IconButton label="Filters" icon={<Icon.Filter />} />
    </div>
  );
}

function HistoryPage({ proposed }: { proposed: boolean }) {
  const tabsId = useTabsId();
  return (
    <div className="space-y-3 px-4 py-4">
      <PageHeader
        title="Market"
        meta={<span className="text-xs text-text-dim">just now</span>}
        actions={
          <>
            <IconButton icon={<Icon.Refresh />} label="Refresh" />
            <IconButton icon={<Icon.Download />} label="Export" />
          </>
        }
      />
      <Tabs
        tabsId={tabsId}
        label="Market views"
        value="history"
        onChange={() => {}}
        tabs={[
          { id: 'browser', label: 'Market' },
          { id: 'orders', label: 'Open' },
          { id: 'stock', label: 'Stock' },
          { id: 'history', label: 'History' },
          { id: 'appraisal', label: 'Appraisal' },
        ]}
      />
      <div className="space-y-4">
        <SummaryStrip proposed={proposed} />
        <Panel padded={false}>
          <FilterRow proposed={proposed} />
          <div className="overflow-x-auto">
            <DataTable
              label="Transactions"
              columns={fillColumns(proposed)}
              rows={FILLS}
              rowKey={(f) => f.id}
              responsive="table"
            />
          </div>
        </Panel>
      </div>
    </div>
  );
}

const meta = {
  title: 'mockups/MarketHistoryTradingProfit',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/market/history' } },
  render: () => <HistoryPage proposed />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Today, rebuilt with sample fills (no seeded History page story exists): Sold / Bought / Net, one Character. */
export const Today: Story = { render: () => <HistoryPage proposed={false} /> };

/** @summary Proposed: Margin (41 of 45 sales matched) and Broker fees in the strip, "since 4 Oct" coverage, All characters selected. New components: TradingProfitFigures, ArchiveCoverageNote; the Character filter is the existing CharacterFilterControl, new to this page. */
export const Proposed: Story = {};

/** @summary The proposal on a phone. */
export const ProposedPhone: Story = { globals: phone };
