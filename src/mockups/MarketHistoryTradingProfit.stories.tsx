import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  DataTable,
  Disclosure,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  SegmentedControl,
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
 * rather than subtracted. The "By item" disclosure gets a "By item | By day"
 * toggle beside Best / Worst first. The page gains the Character filter (inline
 * in the existing filter row, no new row) with "All characters": FIFO then
 * pools buys across every Character in the view, rows and strip alike. When
 * the wallet history saved on this device is shorter than the range, the
 * strip's range line says "since <date>".
 *
 * New components in this mockup: `TradingProfitFigures` (Margin and Broker
 * fees in the strip), `ArchiveCoverageNote` ("since 4 Oct" on the range
 * line), `RollupViewToggle` (By item | By day) and `MarginByDayTable`. The
 * Character filter is the existing `CharacterFilterControl`, unmarked; it is
 * new to History, which has none today. Everything else is an existing primitive
 * or the page's own markup copied from `TransactionsPanel`,
 * `TransactionsSummaryStrip` and `TransactionsItemRollup`.
 */

const ME = 2119876543;

type View = 'item' | 'day';

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

interface ItemRow {
  key: string;
  label: string;
  fills: number;
  unitsSold: number;
  margin: number | null;
}

const BY_ITEM: ItemRow[] = [
  { key: 'hammer', label: 'Hammerhead II', fills: 11, unitsSold: 214, margin: 41_280_000 },
  { key: 'nanite', label: 'Nanite Repair Paste', fills: 9, unitsSold: 18_400, margin: 33_920_500 },
  { key: 'mse', label: 'Medium Shield Extender II', fills: 6, unitsSold: 71, margin: 21_140_000 },
  {
    key: 'membrane',
    label: 'Multispectrum Energized Membrane II',
    fills: 4,
    unitsSold: 19,
    margin: 14_660_000,
  },
  { key: 'dc', label: 'Damage Control II', fills: 5, unitsSold: 64, margin: 9_412_380 },
  { key: 'am', label: 'Antimatter Charge S', fills: 3, unitsSold: 1_400_000, margin: 1_540_000 },
  { key: 'warrior', label: 'Warrior II', fills: 3, unitsSold: 90, margin: -1_540_000 },
  { key: 'inertial', label: 'Inertial Stabilizer II', fills: 4, unitsSold: 12, margin: null },
];

const BY_DAY: ItemRow[] = [
  { key: '16', label: 'Fri 16 Oct', fills: 6, unitsSold: 400_212, margin: 9_840_200 },
  { key: '15', label: 'Thu 15 Oct', fills: 9, unitsSold: 1_046, margin: 18_330_000 },
  { key: '14', label: 'Wed 14 Oct', fills: 7, unitsSold: 2_930, margin: 12_105_000 },
  { key: '13', label: 'Tue 13 Oct', fills: 5, unitsSold: 41, margin: 8_960_000 },
  { key: '12', label: 'Mon 12 Oct', fills: 4, unitsSold: 22, margin: -1_210_000 },
  { key: '11', label: 'Sun 11 Oct', fills: 8, unitsSold: 3_105, margin: 27_440_000 },
  { key: '10', label: 'Sat 10 Oct', fills: 3, unitsSold: 18, margin: 6_212_380 },
  { key: '09', label: 'Fri 9 Oct', fills: 3, unitsSold: 15_640, margin: 38_735_300 },
];

/** `NewComponent`, wide enough that its label never overlaps a short control. */
function Mark({ name, children }: { name: string; children: ReactNode }) {
  return (
    <NewComponent name={name}>
      <div className="min-w-72">{children}</div>
    </NewComponent>
  );
}

const signed = (value: number) => (value > 0 ? `+${formatIsk(value)}` : formatIsk(value));
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

const rollupColumns = (view: View): DataTableColumn<ItemRow>[] => [
  {
    id: 'label',
    header: view === 'item' ? 'Item' : 'Day',
    stickyStart: true,
    render: (r) => r.label,
  },
  {
    id: 'fills',
    header: 'Fills',
    align: 'right',
    className: 'tabular-nums',
    render: (r) => r.fills.toLocaleString(),
  },
  {
    id: 'unitsSold',
    header: 'Units sold',
    align: 'right',
    className: 'tabular-nums',
    render: (r) => r.unitsSold.toLocaleString(),
  },
  {
    id: 'margin',
    header: 'Net margin',
    align: 'right',
    className: 'tabular-nums',
    cellClassName: (r) => (r.margin === null ? 'text-text-dim' : tone(r.margin)),
    render: (r) => (r.margin === null ? '—' : signed(r.margin)),
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
        <dl className="grid min-w-0 flex-1 grid-cols-3 gap-3 tabular-nums">
          <Figure label="Sold" value="+412,880,500" className="text-isk-pos" />
          <Figure label="Bought" value="-298,330,000" className="text-isk-neg" />
          <Figure label="Net" value="+114,550,500" className="items-end text-isk-pos" />
        </dl>
        {proposed && (
          <Mark name="TradingProfitFigures">
            <dl className="grid grid-cols-2 gap-3 tabular-nums">
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

function Rollup({ proposed, view }: { proposed: boolean; view: View }) {
  const rows = view === 'item' ? BY_ITEM : BY_DAY;
  const order = (
    <SegmentedControl
      label="Order items by margin"
      size="sm"
      value="best"
      onChange={() => {}}
      options={[
        { value: 'best', label: 'Best first' },
        { value: 'worst', label: 'Worst first' },
      ]}
    />
  );
  return (
    <Disclosure label={view === 'item' ? 'By item' : 'By day'} expanded onToggle={() => {}}>
      <div className="space-y-2 pt-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-text-dim">Fills from 4 Oct 2026 to 16 Oct 2026.</p>
          <div className="flex flex-wrap items-center gap-2">
            {proposed && (
              <Mark name="RollupViewToggle">
                <SegmentedControl
                  label="Group margin by"
                  size="sm"
                  value={view}
                  onChange={() => {}}
                  options={[
                    { value: 'item', label: 'By item' },
                    { value: 'day', label: 'By day' },
                  ]}
                />
              </Mark>
            )}
            {view === 'item' && order}
          </div>
        </div>
        {view === 'day' ? (
          <Mark name="MarginByDayTable">
            <DataTable
              label="By day"
              density="compact"
              responsive="table"
              columns={rollupColumns('day')}
              rows={rows}
              rowKey={(r) => r.key}
              onRowClick={() => {}}
            />
          </Mark>
        ) : (
          <DataTable
            label="By item"
            density="compact"
            responsive="table"
            columns={rollupColumns('item')}
            rows={rows}
            rowKey={(r) => r.key}
            onRowClick={() => {}}
          />
        )}
      </div>
    </Disclosure>
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

function HistoryPage({ proposed, view = 'item' }: { proposed: boolean; view?: View }) {
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
        <div className="space-y-2">
          <SummaryStrip proposed={proposed} />
          <Rollup proposed={proposed} view={view} />
        </div>
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

/** @summary Today, rebuilt with sample fills (no seeded History page story exists): Sold / Bought / Net, By item, one Character. */
export const Today: Story = { render: () => <HistoryPage proposed={false} /> };

/** @summary Proposed: Margin (41 of 45 sales matched) and Broker fees in the strip, "since 4 Oct" coverage, By item | By day toggle, All characters selected. New components: TradingProfitFigures, ArchiveCoverageNote, RollupViewToggle; the Character filter is the existing CharacterFilterControl, new to this page. */
export const Proposed: Story = {};

/** @summary The rollup switched to By day: net margin per day over the range. New component: MarginByDayTable. */
export const ProposedByDay: Story = { render: () => <HistoryPage proposed view="day" /> };

/** @summary The proposal on a phone. */
export const ProposedPhone: Story = { globals: phone };
