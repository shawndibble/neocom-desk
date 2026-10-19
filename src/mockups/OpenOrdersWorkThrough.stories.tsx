import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Button,
  DataTable,
  IconButton,
  PageHeader,
  Panel,
  SearchInput,
  Tabs,
  useTabsId,
  type DataTableColumn,
} from '@/components/ui';
import { Caret } from '@/components/ui/Disclosure';
import {
  focusRingInsetClassName,
  rowInteractiveClassName,
  selectedRowClassName,
} from '@/components/ui/controlStyles';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import * as Icon from '@/components/ui/icons';
import { textActionClassName } from '@/components/ui/textActionClassName';
import { OrderProblemBadge, type OrderBadgeKind } from '@/features/market/OrderProblemBadge';
import { cx } from '@/lib/cx';
import { formatIskAuto } from '@/lib/isk';
import { NewComponent } from './NewComponent';

/**
 * Proposal (T1): Open Orders gets a work-through mode. "Work through (12)"
 * sits at the end of the existing summary line. Pressed, it walks the orders
 * that need a fix in the page's own group order (Priced below cost first, then
 * undercut at station, system, region, expiring, outbid), row sort inside each
 * group. The current row is the selected row; its controls sit inside it
 * ("4.12 copied · Next · Skip"), and the summary line ends in "3 of 12 · Stop".
 * No new bar or row. Next re-reads the hub book, copies the one-tick price,
 * sends Open in EVE (market details) as the order's owner, marks the row
 * "Sent ✓" and moves on. A row whose next orders read shows the same price and
 * issued time comes back as "Not changed". A below-floor row adds a red line,
 * "Loses 1.2M at 4.12 · See exits" (Order Detail's exits). On a phone there
 * is no copy: the new price shows large, with "Open in EVE · Next · Skip".
 *
 * New components in this mockup: `WorkThroughStart` (the text action at the
 * end of the summary line), `WorkThroughProgress` ("3 of 12 · Stop" in its
 * place), `WorkThroughRowControls` (the current row's price, Next and Skip),
 * `WorkThroughRowStatus` ("Sent ✓" / "Not changed" on a row already passed),
 * `BelowFloorLossLine` (the red loss line with See exits). Everything else is
 * an existing primitive, `OrderProblemBadge`, or the page's own markup
 * (group headers, phone row) copied from `OpenOrdersPanel` / `OpenOrdersList`.
 */

type Mode = 'today' | 'idle' | 'running';
type GroupKey =
  | 'belowFloor'
  | 'undercutStation'
  | 'undercutSystem'
  | 'undercutRegion'
  | 'expiringOrStale'
  | 'outbid';
type Work = 'sent' | 'notChanged' | 'current';

interface Row {
  id: number;
  group: GroupKey;
  item: string;
  where: string;
  price: number;
  badge: OrderBadgeKind;
  detail?: string;
  sentence: string;
  floor: number | null;
  remaining: string;
  expires: string;
  /** The legal one-tick price Next would copy. */
  newPrice: number;
  /** Loss at the new price, below-floor rows only. */
  loss?: string;
  /** Running state, set by `rowsFor`. */
  work?: Work;
}

const GROUPS: { key: GroupKey; title: string; hint: string; accent: string; isk: string }[] = [
  {
    key: 'belowFloor',
    title: 'Priced below cost',
    hint: 'These lose money every time one sells. Put the price up, or accept it.',
    accent: 'border-l-danger',
    isk: '41,880,000 ISK listed',
  },
  {
    key: 'undercutStation',
    title: 'Undercut at my station',
    hint: 'Buyers at your station see a cheaper order before yours.',
    accent: 'border-l-danger',
    isk: '612,400,000 ISK listed · worst -4.1%',
  },
  {
    key: 'undercutSystem',
    title: 'Undercut in my system',
    hint: 'Your station still leads. Another station in the same system is cheaper.',
    accent: 'border-l-warning',
    isk: '88,150,000 ISK listed · worst -2.3%',
  },
  {
    key: 'undercutRegion',
    title: 'Undercut in my region',
    hint: 'Cheaper stock is out there, but several jumps away. Usually safe to ignore.',
    accent: 'border-l-accent',
    isk: '19,600,000 ISK listed · worst -1.0%',
  },
  {
    key: 'expiringOrStale',
    title: 'Expiring or stale',
    hint: 'These run out soon with stock left, or have not sold in a while.',
    accent: 'border-l-line',
    isk: '9,450,000 ISK listed',
  },
  {
    key: 'outbid',
    title: 'Outbid buy order',
    hint: 'Someone bids higher on your buy order, so sellers go to them first.',
    accent: 'border-l-line',
    isk: '140,000,000 ISK in escrow',
  },
];

const JITA = 'Jita IV - Moon 4 - Caldari Navy Assembly Plant';
const PERIMETER = 'Perimeter - Tranquility Trading Tower';

const ROWS: Row[] = [
  {
    id: 1,
    group: 'belowFloor',
    item: 'Hobgoblin II',
    where: JITA,
    price: 598_000,
    badge: 'belowFloor',
    sentence: 'Selling at this price loses 41,200 a unit',
    floor: 639_200,
    remaining: '12 / 40',
    expires: '28 Oct',
    newPrice: 597_900,
  },
  {
    id: 2,
    group: 'belowFloor',
    item: 'Warrior II',
    where: JITA,
    price: 488_000,
    badge: 'belowFloor',
    sentence: 'Selling at this price loses 23,500 a unit',
    floor: 511_500,
    remaining: '40 / 100',
    expires: '2 Nov',
    newPrice: 487_900,
  },
  {
    id: 3,
    group: 'belowFloor',
    item: 'Antimatter Charge S',
    where: JITA,
    price: 4.15,
    badge: 'belowFloor',
    sentence: 'Selling at this price loses 1.95 a unit',
    floor: 6.1,
    remaining: '600,000 / 1,000,000',
    expires: '9 Nov',
    newPrice: 4.12,
    loss: '1.2M',
  },
  {
    id: 4,
    group: 'undercutStation',
    item: 'Hammerhead II',
    where: JITA,
    price: 1_189_000,
    badge: 'undercutStation',
    detail: '-4.1%',
    sentence: 'Station cheapest is 1,142,000 · 3 sellers under you',
    floor: 905_000,
    remaining: '50 / 50',
    expires: '30 Oct',
    newPrice: 1_141_900,
  },
  {
    id: 5,
    group: 'undercutStation',
    item: 'Damage Control II',
    where: JITA,
    price: 642_500,
    badge: 'undercutStation',
    detail: '-1.6%',
    sentence: 'Station cheapest is 632,000 · 1 seller under you',
    floor: 540_000,
    remaining: '18 / 20',
    expires: '4 Nov',
    newPrice: 631_900,
  },
  {
    id: 6,
    group: 'undercutStation',
    item: 'Medium Shield Extender II',
    where: JITA,
    price: 1_948_000,
    badge: 'undercutStation',
    detail: '-0.9%',
    sentence: 'Station cheapest is 1,930,000 · 2 sellers under you',
    floor: 1_610_000,
    remaining: '25 / 30',
    expires: '6 Nov',
    newPrice: 1_929_900,
  },
  {
    id: 7,
    group: 'undercutStation',
    item: 'Nanite Repair Paste',
    where: JITA,
    price: 12_390,
    badge: 'undercutStation',
    detail: '-0.4%',
    sentence: 'Station cheapest is 12,340 · 1 seller under you',
    floor: 9_870,
    remaining: '3,200 / 5,000',
    expires: '11 Nov',
    newPrice: 12_330,
  },
  {
    id: 8,
    group: 'undercutSystem',
    item: 'Hail S',
    where: JITA,
    price: 648,
    badge: 'undercutSystem',
    detail: '-2.3%',
    sentence: 'System cheapest is 633',
    floor: 512,
    remaining: '9,400 / 10,000',
    expires: '1 Nov',
    newPrice: 632,
  },
  {
    id: 9,
    group: 'undercutSystem',
    item: 'Medium EM Shield Reinforcer I',
    where: JITA,
    price: 418_000,
    badge: 'undercutSystem',
    detail: '-1.1%',
    sentence: 'System cheapest is 413,400',
    floor: null,
    remaining: '25 / 25',
    expires: '3 Nov',
    newPrice: 413_300,
  },
  {
    id: 10,
    group: 'undercutRegion',
    item: 'Inertial Stabilizer II',
    where: PERIMETER,
    price: 980_000,
    badge: 'undercutRegion',
    detail: '7 jumps',
    sentence: 'Region cheapest is 970,200',
    floor: 820_000,
    remaining: '20 / 20',
    expires: '7 Nov',
    newPrice: 970_100,
  },
  {
    id: 11,
    group: 'expiringOrStale',
    item: 'Multispectrum Energized Membrane II',
    where: JITA,
    price: 3_150_000,
    badge: 'expiring',
    detail: '2d',
    sentence: '2d left with 3 unsold',
    floor: 2_740_000,
    remaining: '3 / 10',
    expires: '18 Oct',
    newPrice: 3_149_900,
  },
  {
    id: 12,
    group: 'outbid',
    item: 'Tritanium',
    where: JITA,
    price: 3.98,
    badge: 'outbid',
    sentence: 'A rival bids 4.01 ISK, 0.03 over you',
    floor: null,
    remaining: '35,000,000 / 40,000,000',
    expires: '20 Nov',
    newPrice: 4.02,
  },
];

/** Rows passed and current while running: the queue is at 3 of 12. */
const RUNNING: Record<number, Work> = { 1: 'sent', 2: 'notChanged', 3: 'current' };

const rowsFor = (mode: Mode) =>
  ROWS.map((row) => (mode === 'running' ? { ...row, work: RUNNING[row.id] } : row));

const CURRENT_ID = 3;

function inlineAction(label: string) {
  return (
    <button type="button" className={textActionClassName('inline-flex whitespace-nowrap')}>
      {label}
    </button>
  );
}

/** `NewComponent`, wide enough that its label never overlaps a short control. */
function Mark({ name, children }: { name: string; children: ReactNode }) {
  return (
    <NewComponent name={name}>
      <div className="min-w-80">{children}</div>
    </NewComponent>
  );
}

const dot = <span className="text-text-dim">·</span>;

/** The current row's controls (desktop): the copied price, Next, Skip. */
function DesktopRowControls() {
  return (
    <Mark name="WorkThroughRowControls">
      <span className="flex flex-wrap items-center gap-x-1.5 text-xs">
        <span className="tabular-nums text-success">4.12 copied</span>
        {dot}
        {inlineAction('Next')}
        {dot}
        {inlineAction('Skip')}
      </span>
    </Mark>
  );
}

function LossLine({ row }: { row: Row }) {
  return (
    <Mark name="BelowFloorLossLine">
      <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-danger">
        <span className="tabular-nums">
          Loses {row.loss} at {formatIskAuto(row.newPrice)}
        </span>
        {dot}
        {inlineAction('See exits')}
      </span>
    </Mark>
  );
}

function RowStatus({ work }: { work: Work }) {
  return (
    <Mark name="WorkThroughRowStatus">
      {work === 'sent' ? (
        <span className="text-xs text-success">Sent ✓</span>
      ) : (
        <span className="text-xs text-warning">Not changed</span>
      )}
    </Mark>
  );
}

function ProblemCell({ row }: { row: Row }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <OrderProblemBadge kind={row.badge} detail={row.detail} />
      {row.work === 'current' ? (
        <>
          <DesktopRowControls />
          {row.loss && <LossLine row={row} />}
        </>
      ) : row.work ? (
        <RowStatus work={row.work} />
      ) : (
        <span className="text-xs text-text-dim">{row.sentence}</span>
      )}
    </div>
  );
}

const columns: DataTableColumn<Row>[] = [
  {
    id: 'item',
    header: 'Item',
    primary: true,
    render: (row) => <span className={entityLinkClassName()}>{row.item}</span>,
  },
  {
    id: 'where',
    header: 'Location',
    className: 'text-text-dim',
    render: (row) => row.where.split(' - ')[0],
  },
  {
    id: 'price',
    header: 'Price',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => formatIskAuto(row.price),
  },
  { id: 'problem', header: 'Problem', render: (row) => <ProblemCell row={row} /> },
  {
    id: 'floor',
    header: 'Never sell below',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => (row.floor === null ? 'Unknown' : formatIskAuto(row.floor)),
  },
  {
    id: 'remaining',
    header: 'Remaining',
    align: 'right',
    className: 'tabular-nums',
    render: (row) => row.remaining,
  },
  {
    id: 'expires',
    header: 'Expires',
    className: 'whitespace-nowrap text-text-dim',
    render: (row) => row.expires,
  },
];

/** The phone row, after `OpenOrdersList`: a tap-to-open button, controls beside it, not in it. */
function PhoneRow({ row }: { row: Row }) {
  const current = row.work === 'current';
  return (
    <li data-row-key={row.id} className={cx('flex flex-col', current && selectedRowClassName)}>
      <button
        type="button"
        className={cx(
          'flex min-h-11 min-w-0 flex-1 flex-col gap-1 px-3 py-2 text-left',
          rowInteractiveClassName,
          focusRingInsetClassName
        )}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="truncate text-sm text-accent">{row.item}</span>
          <span className="shrink-0 text-sm font-semibold text-text tabular-nums">
            {formatIskAuto(row.price)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <OrderProblemBadge kind={row.badge} detail={row.detail} interactive={false} />
          {!row.work && <span className="text-xs text-text-dim">{row.sentence}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-text-dim tabular-nums">
          <span>Remaining: {row.remaining}</span>
          {row.floor !== null && <span>Never sell below: {formatIskAuto(row.floor)}</span>}
        </span>
      </button>
      {row.work && !current && (
        <div className="px-3 pb-2">
          <RowStatus work={row.work} />
        </div>
      )}
      {current && (
        <div className="space-y-2 px-3 pb-3">
          <Mark name="WorkThroughRowControls">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <span className="flex flex-col">
                <span className={eyebrowClassName}>New price</span>
                <span className="text-2xl font-semibold text-text tabular-nums">
                  {formatIskAuto(row.newPrice)}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-x-1.5">
                {inlineAction('Open in EVE')}
                {dot}
                {inlineAction('Next')}
                {dot}
                {inlineAction('Skip')}
              </span>
            </div>
          </Mark>
          {row.loss && <LossLine row={row} />}
        </div>
      )}
    </li>
  );
}

const groupButtonClassName = cx(
  'flex min-h-11 flex-1 items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold tracking-widest text-text-dim uppercase md:min-h-0',
  rowInteractiveClassName,
  focusRingInsetClassName
);

function GroupHeader({ group, count }: { group: (typeof GROUPS)[number]; count: number }) {
  return (
    <div className={cx('flex flex-col border-l-2 bg-panel-2', group.accent)}>
      <div className="flex items-center justify-between gap-2 pr-3">
        <button type="button" aria-expanded className={groupButtonClassName}>
          <Caret expanded />
          {group.title} · {count}
        </button>
        <IconButton
          size="sm"
          variant="plain"
          icon={<Icon.Refresh />}
          label={`Refresh system & region prices: ${group.title}`}
          tooltip="Refresh system & region prices"
        />
      </div>
      <p className="px-3 pb-2 pl-8 text-[0.6875rem] text-text-dim">
        {group.hint} · {group.isk}
      </p>
    </div>
  );
}

function SummaryLine({ mode }: { mode: Mode }) {
  let tail: ReactNode = null;
  if (mode === 'idle') {
    tail = <Mark name="WorkThroughStart">{inlineAction('Work through (12)')}</Mark>;
  } else if (mode === 'running') {
    tail = (
      <Mark name="WorkThroughProgress">
        <span className="flex items-center gap-x-1.5 text-xs">
          <span className="tabular-nums text-text">3 of 12</span>
          {dot}
          {inlineAction('Stop')}
        </span>
      </Mark>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-dim">
      <span>40 orders · 12 need attention</span>
      {tail && dot}
      {tail}
    </div>
  );
}

function OpenOrdersPage({ mode, phone = false }: { mode: Mode; phone?: boolean }) {
  const tabsId = useTabsId();
  const rows = rowsFor(mode);
  return (
    <div className="space-y-3 px-4 py-4">
      <PageHeader
        title="Market"
        meta={<span className="text-xs text-text-dim">just now</span>}
        actions={
          <>
            <IconButton icon={<Icon.Refresh />} label="Refresh orders" />
            <IconButton icon={<Icon.Download />} label="Export" />
          </>
        }
      />
      <Tabs
        tabsId={tabsId}
        label="Market views"
        value="orders"
        onChange={() => {}}
        tabs={[
          { id: 'browser', label: 'Market' },
          { id: 'orders', label: 'Open' },
          { id: 'stock', label: 'Stock' },
          { id: 'history', label: 'History' },
          { id: 'appraisal', label: 'Appraisal' },
        ]}
      />
      <Panel padded={false}>
        <div className="px-3 pt-2 pb-1">
          <SummaryLine mode={mode} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <SearchInput
            className="min-w-48 flex-1"
            value=""
            onChange={() => {}}
            placeholder="Search item or location…"
            aria-label="Search orders"
          />
          {!phone && <IconButton label="Columns" icon={<Icon.ColumnsPicker />} />}
          <IconButton label="Filters" icon={<Icon.Filter />} />
        </div>
        {GROUPS.map((group) => {
          const groupRows = rows.filter((row) => row.group === group.key);
          return (
            <div key={group.key}>
              <GroupHeader group={group} count={groupRows.length} />
              {phone ? (
                <ul aria-label={group.title} className="divide-y divide-line">
                  {groupRows.map((row) => (
                    <PhoneRow key={row.id} row={row} />
                  ))}
                </ul>
              ) : (
                <DataTable
                  label={`${group.title} · ${groupRows.length}`}
                  columns={columns}
                  rows={groupRows}
                  rowKey={(row) => row.id}
                  onRowClick={() => {}}
                  rowMoreActions
                  selectedRowKey={mode === 'running' ? CURRENT_ID : null}
                />
              )}
            </div>
          );
        })}
        <div className="flex flex-col border-l-2 border-l-success bg-panel-2">
          <div className="flex items-center justify-between gap-2 pr-3">
            <button type="button" aria-expanded={false} className={groupButtonClassName}>
              <Caret expanded={false} />
              Healthy · 28
            </button>
            {inlineAction('Show healthy orders')}
          </div>
          <p className="px-3 pb-2 pl-8 text-[0.6875rem] text-text-dim">
            Nothing wrong here. Nobody beats your price.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-3 py-2">
          <Button size="sm">What do these badges mean?</Button>
        </div>
      </Panel>
    </div>
  );
}

const meta = {
  title: 'mockups/OpenOrdersWorkThrough',
  tags: ['!manifest'],
  parameters: { layout: 'fullscreen', shell: { path: '/market/orders' } },
  render: () => <OpenOrdersPage mode="idle" />,
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;
const phone = { viewport: { value: 'mobile1', isRotated: false } };

/** @summary Today, rebuilt with sample rows (no seeded Open Orders page story exists): the summary line is counts only. */
export const Today: Story = { render: () => <OpenOrdersPage mode="today" /> };

/** @summary Idle: the summary line ends with "Work through (12)". New component: WorkThroughStart. */
export const ProposedIdle: Story = {};

/** @summary Running, 3 of 12: the current below-floor row is selected with "4.12 copied · Next · Skip" and its red loss line; rows already passed say "Sent ✓" or "Not changed"; the summary line ends "3 of 12 · Stop". New components: WorkThroughProgress, WorkThroughRowControls, WorkThroughRowStatus, BelowFloorLossLine. */
export const ProposedRunning: Story = { render: () => <OpenOrdersPage mode="running" /> };

/** @summary Running on a phone: no copy; the current row shows the new price large with "Open in EVE · Next · Skip" below the tap-to-open row. */
export const ProposedRunningPhone: Story = {
  render: () => <OpenOrdersPage mode="running" phone />,
  globals: phone,
};
